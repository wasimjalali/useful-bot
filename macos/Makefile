APP = dist/Useful Bot.app
CLT_FRAMEWORKS = /Library/Developer/CommandLineTools/Library/Developer/Frameworks
CLT_INTEROP = /Library/Developer/CommandLineTools/Library/Developer/usr/lib/lib_TestingInterop.dylib
DEBUG_DIR = $(shell swift build --show-bin-path --build-tests 2>/dev/null)
SWIFT_TEST_FLAGS = -Xswiftc -F -Xswiftc $(CLT_FRAMEWORKS)

.PHONY: build test icon bundle clean

build:
	swift build -c release

test:
	swift build --build-tests $(SWIFT_TEST_FLAGS)
	cp -R "$(CLT_FRAMEWORKS)/Testing.framework" "$(DEBUG_DIR)/" 2>/dev/null || true
	cp "$(CLT_INTEROP)" "$(DEBUG_DIR)/" 2>/dev/null || true
	swift test --skip-build $(SWIFT_TEST_FLAGS)

icon:
	./scripts/make-icon.sh

bundle: build icon
	rm -rf "$(APP)"
	mkdir -p "$(APP)/Contents/MacOS" "$(APP)/Contents/Resources"
	cp bundle/Info.plist "$(APP)/Contents/Info.plist"
	cp .build/release/UsefulBotApp "$(APP)/Contents/MacOS/UsefulBotApp"
	cp assets/AppIcon.icns "$(APP)/Contents/Resources/AppIcon.icns"
	codesign --force --deep --sign - "$(APP)"

clean:
	rm -rf .build dist assets/AppIcon.iconset
