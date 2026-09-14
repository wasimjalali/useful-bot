APP = dist/Useful Bot.app

.PHONY: build test icon bundle clean

build:
	swift build -c release

# Delegate to test.sh so the CLT/Xcode framework search path and the
# TestingInterop copy stay in one place instead of drifting here.
test:
	./test.sh

icon:
	./scripts/make-icon.sh

bundle: build icon
	rm -rf "$(APP)"
	mkdir -p "$(APP)/Contents/MacOS" "$(APP)/Contents/Resources"
	cp bundle/Info.plist "$(APP)/Contents/Info.plist"
	cp .build/release/UsefulBotApp "$(APP)/Contents/MacOS/UsefulBotApp"
	cp assets/AppIcon.icns "$(APP)/Contents/Resources/AppIcon.icns"
	codesign --force --sign - "$(APP)"

clean:
	rm -rf .build dist assets/AppIcon.iconset
