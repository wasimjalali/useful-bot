import Foundation
import UsefulBotCore

/// Disk cache for the paired origin. Protected until first unlock, excluded
/// from backup, never written outside the app container. Spec §13.
struct PhoneCache {
    static let byteBudget = 25 * 1024 * 1024
    static let rowCap = 200

    let root: URL

    init(origin: String) {
        root = PhoneCacheRoot.directory(forOrigin: origin)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var url = root
        try? url.setResourceValues(values)
        try? FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: root.path
        )
        // The use ledger once keyed raw ids that only events files
        // resolved; entries from before filename-keying never evict, so
        // drop them once rather than let their bytes crowd the budget.
        if var uses = read([Use].self, name: "uses.json"), uses.contains(where: { !$0.id.hasSuffix(".json") }) {
            uses.removeAll { !$0.id.hasSuffix(".json") }
            write(uses, name: "uses.json")
        }
    }

    func saveShell(_ store: ShellStore) {
        write(store, name: "shell.json")
    }

    func loadShell() -> ShellStore? {
        read(ShellStore.self, name: "shell.json")
    }

    func saveEvents(_ botId: String, _ events: [AgentEvent]) {
        let tail = Array(events.suffix(Self.rowCap))
        let name = "events-\(safe(botId)).json"
        write(tail, name: name)
        touch(name, bytes: tail.reduce(0) { $0 + $1.text.utf8.count + 64 })
        evict()
    }

    func loadEvents(_ botId: String) -> [AgentEvent]? {
        read([AgentEvent].self, name: "events-\(safe(botId)).json")
    }

    func saveDraft(_ botId: String, _ text: String) {
        let name = "draft-\(safe(botId)).json"
        write(text, name: name)
        touch(name, bytes: text.utf8.count)
        evict()
    }

    func loadDraft(_ botId: String) -> String? {
        read(String.self, name: "draft-\(safe(botId)).json")
    }

    func saveCursor(_ cursor: StreamCursor) {
        let name = "cursor-\(safe(cursor.sessionId)).json"
        write(cursor, name: name)
        touch(name, bytes: 256)
        evict()
    }

    func loadCursor(_ sessionId: String) -> StreamCursor? {
        read(StreamCursor.self, name: "cursor-\(safe(sessionId)).json")
    }

    private struct Use: Codable {
        var id: String
        var bytes: Int
        var lastUsed: Date
    }

    private func touch(_ id: String, bytes: Int) {
        var uses = read([Use].self, name: "uses.json") ?? []
        uses.removeAll { $0.id == id }
        uses.append(Use(id: id, bytes: bytes, lastUsed: Date()))
        write(uses, name: "uses.json")
    }

    private func evict() {
        let uses = read([Use].self, name: "uses.json") ?? []
        let dropped = CacheBudget.evictions(
            uses.map { CacheBudget.Entry(id: $0.id, bytes: $0.bytes, lastUsed: $0.lastUsed, pinned: false) },
            budget: Self.byteBudget
        )
        guard !dropped.isEmpty else { return }
        // `id` is the file name itself — events, cursors and drafts all
        // evict through the one budget.
        for id in dropped {
            try? FileManager.default.removeItem(at: root.appendingPathComponent(id))
        }
        write(uses.filter { !dropped.contains($0.id) }, name: "uses.json")
    }

    private func write<T: Encodable>(_ value: T, name: String) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(value) else { return }
        try? data.write(to: root.appendingPathComponent(name), options: .atomic)
    }

    private func read<T: Decodable>(_ type: T.Type, name: String) -> T? {
        let url = root.appendingPathComponent(name)
        guard let data = try? Data(contentsOf: url) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(type, from: data)
    }

    /// Collision-free: every non-alphanumeric scalar escapes to a
    /// fixed-width `_XXXXXX` (`_` itself escapes), so two distinct ids
    /// can never fold into the same file name.
    private func safe(_ value: String) -> String {
        value.unicodeScalars.map { scalar in
            CharacterSet.alphanumerics.contains(scalar)
                ? String(scalar)
                : "_" + String(format: "%06x", scalar.value)
        }.joined()
    }
}
