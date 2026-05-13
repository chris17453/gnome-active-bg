#!/usr/bin/env bash
# Launches gnome-shell --nested --wayland and patches the session-bus
# activation environment so D-Bus-activated services (notably the
# extension-prefs window) attach to the nested compositor instead of
# the host session.
#
# Run inside `dbus-run-session` so DBUS_SESSION_BUS_ADDRESS points at
# the throwaway bus, e.g.:
#   dbus-run-session -- bash scripts/dev-launch.sh
set -u

RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

mapfile -t BEFORE < <(ls "${RUNTIME_DIR}"/wayland-* 2>/dev/null | grep -v '\.lock$' || true)

(
    NEW_SOCKET=""
    for _ in $(seq 1 80); do
        sleep 0.25
        mapfile -t AFTER < <(ls "${RUNTIME_DIR}"/wayland-* 2>/dev/null | grep -v '\.lock$' || true)
        for sock in "${AFTER[@]}"; do
            found=0
            for old in "${BEFORE[@]}"; do
                [[ "${sock}" == "${old}" ]] && found=1 && break
            done
            if [[ ${found} -eq 0 ]]; then
                NEW_SOCKET="$(basename "${sock}")"
                break
            fi
        done
        [[ -n "${NEW_SOCKET}" ]] && break
    done

    if [[ -z "${NEW_SOCKET}" ]]; then
        echo "[dev-launch] WARN: nested wayland socket not detected; prefs may open on host" >&2
        exit 0
    fi

    ENV_VARS=(
        "WAYLAND_DISPLAY=${NEW_SOCKET}"
        "GDK_BACKEND=wayland"
    )
    [[ -n "${XDG_DATA_HOME:-}" ]] && ENV_VARS+=("XDG_DATA_HOME=${XDG_DATA_HOME}")

    if ! dbus-update-activation-environment "${ENV_VARS[@]}" >/dev/null 2>&1; then
        echo "[dev-launch] WARN: dbus-update-activation-environment failed" >&2
    else
        echo "[dev-launch] activation env updated (WAYLAND_DISPLAY=${NEW_SOCKET})" >&2
    fi
) &

# Silence the at-spi registration retry-loop that otherwise floods the
# log when WebKit (used by the extension's prefs preview and the daemon)
# spawns child processes inside a nested session.
export GTK_A11Y=none
export NO_AT_BRIDGE=1

# Auto-enable our extension in the fresh dev dconf. Without this you'd
# have to open Extensions and toggle it on every `make dev`.
gsettings set org.gnome.shell disable-user-extensions false 2>/dev/null || true
gsettings set org.gnome.shell enabled-extensions \
    "['active-bg@watkinslabs.com']" 2>/dev/null || true

exec gnome-shell --nested --wayland "$@"
