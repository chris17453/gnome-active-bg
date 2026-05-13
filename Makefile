# gnome-active-bg Makefile
# Live canvas wallpapers as a GNOME shell extension + standalone daemon.

EXTENSION_UUID = active-bg@watkinslabs.com
EXTENSION_DIR = $(EXTENSION_UUID)
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(EXTENSION_UUID)
BUILD_DIR = build
PACKAGE_STAGING_DIR = $(BUILD_DIR)/package/$(EXTENSION_UUID)
METADATA = $(EXTENSION_DIR)/metadata.json

# Current version from metadata.json (defaults to 1 if missing).
VERSION := $(shell grep -o '"version": *[0-9]*' $(METADATA) 2>/dev/null | grep -o '[0-9]*')
VERSION := $(if $(VERSION),$(VERSION),1)
ZIP_NAME = $(EXTENSION_UUID).v$(VERSION).shell-extension.zip

# Extension-only files (live inside $(EXTENSION_DIR)).
EXT_FILES = extension.js prefs.js runtime.js cairo-shim.js metadata.json
EXT_DIRS  = schemas effects-gjs

# Project-level assets the extension needs at runtime, copied alongside
# the extension files into INSTALL_DIR.
ASSET_FILES = frame.html index.html
ASSET_DIRS  = effects daemon

# Colors
C_RED    := \033[0;31m
C_GREEN  := \033[0;32m
C_YELLOW := \033[0;33m
C_BLUE   := \033[0;34m
C_NC     := \033[0m

P_INFO := $(C_BLUE)[*]$(C_NC)
P_OK   := $(C_GREEN)[✓]$(C_NC)
P_WARN := $(C_YELLOW)[!]$(C_NC)
P_ERR  := $(C_RED)[✗]$(C_NC)

.PHONY: help install uninstall enable disable reload dev dev-install dev-extras \
        launch restart clean build compile-schemas check-deps status version bump \
        release deploy preview serve

help:
	@echo "gnome-active-bg - Available targets:"
	@echo ""
	@echo "  Development:"
	@echo "    make install        - Install extension + assets to user dir"
	@echo "    make uninstall      - Remove extension"
	@echo "    make enable         - Enable the extension"
	@echo "    make disable        - Disable the extension"
	@echo "    make reload         - Reinstall and reload"
	@echo "    make dev            - Test in nested GNOME Shell (DEV_RESOLUTION=WxH,"
	@echo "                          DEV_EXTRA_EXTENSIONS=\"uuid1 uuid2\")"
	@echo "    make launch         - Alias for make dev"
	@echo "    make restart        - Restart GNOME Shell (X11 only)"
	@echo ""
	@echo "  Preview (no install):"
	@echo "    make preview        - Open the effect grid in your browser"
	@echo "    make serve          - Serve repo on http://localhost:8080"
	@echo ""
	@echo "  Release:"
	@echo "    make version        - Show current version"
	@echo "    make bump           - Bump version (1 -> 2)"
	@echo "    make build          - Create zip for extensions.gnome.org"
	@echo "    make release        - Bump version + build"
	@echo ""
	@echo "  Utilities:"
	@echo "    make clean          - Remove build artifacts"
	@echo "    make compile-schemas- Compile GSettings schemas"
	@echo "    make check-deps     - Verify required tools are installed"
	@echo "    make status         - Show extension status"

check-deps:
	@printf "$(P_INFO) Checking dependencies...\n"
	@command -v gnome-extensions >/dev/null 2>&1 || { printf "$(P_ERR) gnome-extensions not found\n"; exit 1; }
	@command -v glib-compile-schemas >/dev/null 2>&1 || { printf "$(P_ERR) glib-compile-schemas not found\n"; exit 1; }
	@command -v zip >/dev/null 2>&1 || { printf "$(P_ERR) zip not found\n"; exit 1; }
	@command -v python3 >/dev/null 2>&1 || { printf "$(P_ERR) python3 not found (required to run the daemon)\n"; exit 1; }
	@python3 -c "import gi; gi.require_version('Gtk','4.0'); from gi.repository import Gtk" >/dev/null 2>&1 \
		|| { printf "$(P_ERR) python3-gobject GTK4 bindings missing\n"; \
		     printf "      Fedora: sudo dnf install python3-gobject gtk4\n"; \
		     printf "      Debian/Ubuntu: sudo apt install python3-gi gir1.2-gtk-4.0\n"; \
		     exit 1; }
	@python3 -c "import gi; gi.require_version('WebKit','6.0'); from gi.repository import WebKit" >/dev/null 2>&1 \
		|| { printf "$(P_ERR) WebKitGTK 6.0 (GTK4) typelib missing\n"; \
		     printf "      Fedora: sudo dnf install webkitgtk6.0\n"; \
		     printf "      Debian/Ubuntu: sudo apt install gir1.2-webkit-6.0\n"; \
		     exit 1; }
	@python3 -c "import gi; gi.require_version('Gtk4LayerShell','1.0'); from gi.repository import Gtk4LayerShell" >/dev/null 2>&1 \
		|| { printf "$(P_ERR) gtk4-layer-shell typelib missing — daemon will refuse to render\n"; \
		     printf "      Fedora: sudo dnf install gtk4-layer-shell\n"; \
		     printf "      Debian/Ubuntu: sudo apt install gir1.2-gtk4-layer-shell-1.0\n"; \
		     printf "      Arch: sudo pacman -S gtk4-layer-shell\n"; \
		     exit 1; }
	@printf "$(P_OK) All dependencies found\n"

status:
	@printf "$(P_INFO) Extension status for $(EXTENSION_UUID)...\n"
	@if [ -d "$(INSTALL_DIR)" ]; then \
		printf "$(P_OK) Installed at $(INSTALL_DIR)\n"; \
	else \
		printf "$(P_WARN) NOT installed\n"; \
	fi
	@gnome-extensions info $(EXTENSION_UUID) 2>/dev/null || printf "$(P_WARN) Cannot get extension info (shell may need restart)\n"

compile-schemas:
	@printf "$(P_INFO) Compiling schemas...\n"
	@if [ ! -d "$(EXTENSION_DIR)/schemas" ]; then \
		printf "$(P_ERR) Schema directory not found: $(EXTENSION_DIR)/schemas\n"; \
		exit 1; \
	fi
	@if glib-compile-schemas $(EXTENSION_DIR)/schemas/ 2>&1; then \
		printf "$(P_OK) Schemas compiled\n"; \
	else \
		printf "$(P_ERR) Schema compilation failed\n"; \
		exit 1; \
	fi

# Shared staging logic: copies extension files + project assets into $(1).
define STAGE_TO
	@for f in $(EXT_FILES); do \
		if [ ! -f "$(EXTENSION_DIR)/$$f" ]; then \
			printf "$(P_ERR) Missing required file: $(EXTENSION_DIR)/$$f\n"; exit 1; \
		fi; \
	done
	@for d in $(EXT_DIRS); do \
		if [ ! -d "$(EXTENSION_DIR)/$$d" ]; then \
			printf "$(P_ERR) Missing required directory: $(EXTENSION_DIR)/$$d\n"; exit 1; \
		fi; \
	done
	@for f in $(ASSET_FILES); do \
		if [ ! -f "$$f" ]; then \
			printf "$(P_ERR) Missing required asset: $$f\n"; exit 1; \
		fi; \
	done
	@for d in $(ASSET_DIRS); do \
		if [ ! -d "$$d" ]; then \
			printf "$(P_ERR) Missing required asset dir: $$d\n"; exit 1; \
		fi; \
	done
	@mkdir -p $(1)
	@cp $(addprefix $(EXTENSION_DIR)/, $(EXT_FILES)) $(1)/
	@cp -r $(addprefix $(EXTENSION_DIR)/, $(EXT_DIRS)) $(1)/
	@cp $(ASSET_FILES) $(1)/
	@cp -r $(ASSET_DIRS) $(1)/
endef

install: check-deps compile-schemas
	@printf "$(P_INFO) Installing $(EXTENSION_UUID)...\n"
	@rm -rf $(INSTALL_DIR)
	$(call STAGE_TO,$(INSTALL_DIR))
	@printf "$(P_OK) Installed at $(INSTALL_DIR)\n"
	@printf "$(P_WARN) Run 'make enable' to activate, then restart GNOME Shell\n"
	@printf "    (Alt+F2 -> r -> Enter on X11, or log out/in on Wayland)\n"

uninstall: disable
	@printf "$(P_INFO) Uninstalling $(EXTENSION_UUID)...\n"
	@if [ -d "$(INSTALL_DIR)" ]; then \
		rm -rf $(INSTALL_DIR) && printf "$(P_OK) Removed\n"; \
	else \
		printf "$(P_WARN) Was not installed\n"; \
	fi

enable:
	@printf "$(P_INFO) Enabling $(EXTENSION_UUID)...\n"
	@if [ ! -d "$(INSTALL_DIR)" ]; then \
		printf "$(P_ERR) Not installed. Run 'make install' first\n"; exit 1; \
	fi
	@disable_user_extensions=$$(gsettings get org.gnome.shell disable-user-extensions 2>/dev/null || printf "unknown"); \
	if [ "$$disable_user_extensions" = "true" ]; then \
		printf "$(P_WARN) User extensions are globally disabled\n"; \
		printf "$(P_INFO) Re-enabling globally...\n"; \
		gsettings set org.gnome.shell disable-user-extensions false 2>/dev/null \
			&& printf "$(P_OK) Re-enabled\n" \
			|| { printf "$(P_ERR) Failed to re-enable user extensions\n"; exit 1; }; \
	fi
	@output=$$(gnome-extensions enable $(EXTENSION_UUID) 2>&1); \
	status=$$?; \
	enabled_state=$$(gnome-extensions info $(EXTENSION_UUID) 2>/dev/null | awk -F': ' '/^[[:space:]]*Enabled:/ {print $$2; exit}'); \
	if [ $$status -eq 0 ] && [ "$$enabled_state" = "Yes" ]; then \
		printf "$(P_OK) Enabled\n"; \
	else \
		printf "$(P_ERR) Failed to enable (exit $$status)\n"; \
		[ -n "$$output" ] && printf "$(C_RED)    %s$(C_NC)\n" "$$output"; \
		printf "$(P_WARN) Try restarting GNOME Shell first\n"; \
		exit 1; \
	fi

disable:
	@printf "$(P_INFO) Disabling $(EXTENSION_UUID)...\n"
	@if gnome-extensions disable $(EXTENSION_UUID) 2>/dev/null; then \
		printf "$(P_OK) Disabled\n"; \
	else \
		printf "$(P_WARN) Was not enabled\n"; \
	fi

reload: install
	@printf "$(P_INFO) Reloading $(EXTENSION_UUID)...\n"
	@gnome-extensions disable $(EXTENSION_UUID) 2>/dev/null || true
	@sleep 0.5
	@gnome-extensions enable $(EXTENSION_UUID) 2>/dev/null || true
	@printf "$(P_WARN) GJS caches imports. If changes don't appear, use 'make dev' or log out/in\n"

DEV_RESOLUTION ?= 1700x900

DEV_HOME = $(abspath $(BUILD_DIR)/dev-home)
DEV_DATA_DIR = $(DEV_HOME)/.local/share
DEV_EXT_DIR = $(DEV_DATA_DIR)/gnome-shell/extensions
DEV_INSTALL_DIR = $(DEV_EXT_DIR)/$(EXTENSION_UUID)

DEV_EXTRA_EXTENSIONS ?=

dev-install: check-deps compile-schemas
	@printf "$(P_INFO) Staging $(EXTENSION_UUID) into isolated dev home...\n"
	@rm -rf $(DEV_INSTALL_DIR)
	$(call STAGE_TO,$(DEV_INSTALL_DIR))
	@printf "$(P_OK) Dev staging complete: $(DEV_INSTALL_DIR)\n"

dev-extras:
	@if [ -z "$(DEV_EXTRA_EXTENSIONS)" ]; then \
		printf "$(P_INFO) No extra extensions to mirror\n"; exit 0; \
	fi
	@printf "$(P_INFO) Mirroring host extensions into dev home...\n"
	@mkdir -p $(DEV_EXT_DIR)
	@for uuid in $(DEV_EXTRA_EXTENSIONS); do \
		src="$(HOME)/.local/share/gnome-shell/extensions/$$uuid"; \
		if [ -d "$$src" ]; then \
			rm -rf "$(DEV_EXT_DIR)/$$uuid"; \
			cp -a "$$src" "$(DEV_EXT_DIR)/" && printf "$(P_OK) mirrored $$uuid\n" \
				|| { printf "$(P_ERR) failed to copy $$uuid\n"; exit 1; }; \
		else \
			printf "$(P_WARN) skipped $$uuid (not in host)\n"; \
		fi; \
	done

dev: dev-install dev-extras
	@printf "$(P_INFO) Starting nested GNOME Shell ($(DEV_RESOLUTION))...\n"
	@printf "$(P_INFO) Isolated XDG_DATA_HOME=$(DEV_DATA_DIR)\n"
	@printf "$(P_WARN) Close the nested shell window to stop testing.\n"
	@XDG_DATA_HOME=$(DEV_DATA_DIR) \
		MUTTER_DEBUG_DUMMY_MODE_SPECS=$(DEV_RESOLUTION) \
		dbus-run-session -- bash scripts/dev-launch.sh 2>&1 | grep -v "^$$" || true
	@printf "$(P_OK) Nested session ended\n"

launch: dev

restart:
	@printf "$(P_INFO) Restarting GNOME Shell...\n"
	@if [ "$$XDG_SESSION_TYPE" = "x11" ]; then \
		busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s 'Meta.restart("Restarting...")' 2>/dev/null \
			&& printf "$(P_OK) Restart triggered\n" \
			|| { printf "$(P_ERR) Failed\n"; exit 1; }; \
	else \
		printf "$(P_WARN) Cannot restart GNOME Shell on Wayland — log out and back in\n"; \
	fi

version:
	@printf "$(P_INFO) gnome-active-bg v$(VERSION)\n"
	@printf "    GNOME Shell: 45, 46, 47\n"
	@printf "    metadata.json: $(METADATA)\n"

bump:
	@printf "$(P_INFO) Bumping version from $(VERSION) to $$(($(VERSION) + 1))...\n"
	@sed -i 's/"version": *$(VERSION)/"version": '"$$(($(VERSION) + 1))"'/' $(METADATA)
	@NEW_VER=$$(grep -o '"version": *[0-9]*' $(METADATA) | grep -o '[0-9]*'); \
		printf "$(P_OK) Now v$$NEW_VER\n"

build: check-deps compile-schemas
	@printf "$(P_INFO) Building package v$(VERSION)...\n"
	@mkdir -p $(BUILD_DIR)
	@rm -rf $(PACKAGE_STAGING_DIR)
	$(call STAGE_TO,$(PACKAGE_STAGING_DIR))
	@cd $(PACKAGE_STAGING_DIR) && zip -r ../../$(ZIP_NAME) . >/dev/null 2>&1 \
		|| { printf "$(P_ERR) Failed to create zip\n"; exit 1; }
	@printf "$(P_OK) Package: $(BUILD_DIR)/$(ZIP_NAME)\n"
	@printf "    Size: $$(du -h $(BUILD_DIR)/$(ZIP_NAME) | cut -f1)\n"
	@printf "    Upload to: https://extensions.gnome.org/upload/\n"

release: bump build
	@printf "$(P_OK) Release package ready\n"

deploy: clean build
	@printf "$(P_OK) Ready for deployment\n"

preview:
	@printf "$(P_INFO) Opening the effect grid in your browser...\n"
	@xdg-open "file://$(abspath index.html)" >/dev/null 2>&1 || \
		printf "$(P_WARN) xdg-open failed — open $(abspath index.html) manually\n"

serve:
	@printf "$(P_INFO) Serving repo at http://localhost:8080 (Ctrl-C to stop)\n"
	@python3 -m http.server 8080

clean:
	@printf "$(P_INFO) Cleaning build artifacts...\n"
	@rm -rf $(BUILD_DIR)
	@rm -f $(EXTENSION_DIR)/schemas/gschemas.compiled
	@printf "$(P_OK) Clean complete\n"
