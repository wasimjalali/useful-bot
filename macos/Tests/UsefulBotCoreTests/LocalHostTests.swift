import Testing
@testable import UsefulBotCore

@Suite struct LocalHostTests {
    @Test func blocksLoopbackInEverySpelling() {
        let hosts = [
            "localhost", "LOCALHOST.", "localhost.",
            "127.0.0.1", "127.1", "127.0.0.1.", "0x7f.0.0.1", "0177.0.0.1", "2130706433", "0.0.0.0",
        ]
        for host in hosts {
            #expect(LocalHost.isLocal(host), "expected \(host) to be local")
        }
    }

    @Test func blocksPrivateLinkLocalAndLocalNames() {
        let hosts = [
            "10.0.0.5", "192.168.1.20", "172.16.0.1", "172.31.255.255", "169.254.10.10",
            "printer.local", "thing.localhost",
        ]
        for host in hosts {
            #expect(LocalHost.isLocal(host), "expected \(host) to be local")
        }
    }

    @Test func blocksLocalIPv6() {
        let hosts = [
            "::", "::1", "fe80::1", "fc00::1", "fd00::1",
            "::ffff:127.0.0.1", "::ffff:192.168.0.1", "::127.0.0.1",
            "::ffff:0:127.0.0.1", "0:0:0:0:0:ffff:127.0.0.1", "0:0:0:0:0:0:0:1",
            "0:0:0:0:0:ffff:7f00:1", "[::1]", "fe80::1%en0",
        ]
        for host in hosts {
            #expect(LocalHost.isLocal(host), "expected \(host) to be local")
        }
    }

    @Test func allowsThePublicWeb() {
        let hosts = [
            "example.com", "www.example.com", "8.8.8.8", "1.1.1.1",
            "172.32.0.1", "192.169.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8",
        ]
        for host in hosts {
            #expect(!LocalHost.isLocal(host), "expected \(host) to be public")
        }
    }

    @Test func unknownHostsFailClosed() {
        #expect(LocalHost.isLocal(nil))
        #expect(LocalHost.isLocal(""))
        #expect(LocalHost.isLocal("   "))
        #expect(LocalHost.isLocal("::ffff:999.0.0.1"))
        #expect(LocalHost.isLocal("gggg::1"))
        #expect(LocalHost.isLocal("08.0.0.1"))
        #expect(LocalHost.isLocal("127..0.1"))
        #expect(!LocalHost.isLocal("cafe.de"))
    }
}

@Suite struct ComposerDraftTests {
    @Test func exactDraftClears() {
        #expect(ComposerDraft.remainder("hello", afterSending: "hello") == "")
    }

    @Test func keptTypingOnlyLosesTheSentPart() {
        #expect(ComposerDraft.remainder("hellonext", afterSending: "hello") == "next")
    }

    @Test func editedTextIsLeftAlone() {
        #expect(ComposerDraft.remainder("rewritten", afterSending: "hello") == "rewritten")
        #expect(ComposerDraft.remainder("", afterSending: "hello") == "")
    }
}
