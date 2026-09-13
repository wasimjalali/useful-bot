import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        switch model.phase {
        case .ready:
            NavigationSplitView {
                SidebarView()
                    .navigationSplitViewColumnWidth(min: 220, ideal: 248, max: 320)
            } detail: {
                ChatView()
            }
        case .starting, .unavailable:
            VStack(spacing: 12) {
                if model.phase == .starting {
                    ProgressView()
                        .controlSize(.small)
                }
                Text(model.startingMessage)
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
                if let error = model.threadError {
                    Text(error)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 360)
                }
                if model.phase == .unavailable {
                    Button("Retry") {
                        Task { await model.retry() }
                    }
                    .controlSize(.large)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(nsColor: .windowBackgroundColor))
        }
    }
}
