import Testing
@testable import UsefulBotCore

@Suite struct ServiceSupervisorTests {
    @Test func commandsPointAtRepoServiceScript() {
        let supervisor = ServiceSupervisor()
        let cmd = supervisor.command(mode: .web, repoPath: "/Users/wasim/Desktop/useful-bot")
        #expect(cmd.executable == "/usr/local/bin/node")
        #expect(cmd.arguments == ["/Users/wasim/Desktop/useful-bot/scripts/service.mjs", "web"])
        #expect(cmd.workingDirectory == "/Users/wasim/Desktop/useful-bot")
    }

    @Test func ownsUsefulBotNodeProcessesOnly() {
        let supervisor = ServiceSupervisor()
        #expect(supervisor.isOwnNodeProcess("/usr/local/bin/node scripts/service.mjs web"))
        #expect(supervisor.isOwnNodeProcess("next-server (v16.2.1)"))
        #expect(supervisor.isOwnNodeProcess("node node_modules/next/dist/bin/next dev"))
        #expect(supervisor.isOwnNodeProcess("node --experimental-strip-types router/src/index.ts"))
        #expect(supervisor.isOwnNodeProcess("node node_modules/eve/bin/eve.js dev"))
        #expect(!supervisor.isOwnNodeProcess("node some-other-app"))
        #expect(!supervisor.isOwnNodeProcess("Chrome"))
    }
}
