---
url: /blog/krfoqzqt/index.md
---
## Problem

After uninstalling an app the app may still show under:

System Settings -> General -> Login Items -> Allow in the Background

## Solution

Follow these step to remove the background item:

Note down the enabled/disabled state of all existing background items. We will need to reset these states later.

Optional: Run `sudo sfltool dumpbtm` to list all background item info and check that the one to remove is listed.

Run `sudo sfltool resetbtm` to reset login and background item data. This also enables all background items.

Restart the computer. The leftover background item should now be gone.

Reset remaining background items back to their original enabled/disabled state.

## Other way

### Applications that run on Startup (Run in Terminal)

```shell
ls -lah /Library/StartupItems
```

### Property list (plist) items running on startup

```shell
ls -lah /Library/LaunchDaemons
ls -lah /System/Library/LaunchDaemons
```

### Applications that launch on User Login

```shell
ls -lah /Library/LaunchAgents
ls -lah ~/Library/LaunchAgents
ls -lah /System/Library/LaunchAgents
```

### Applications that run on a set schedule

```shell
crontab -l
```

### Kernel Extensions

```shell
kextstat
```

### Login and Logout Hooks

```shell
defaults read com.apple.loginwindow LoginHook
defaults read com.apple.loginwindow LogoutHook
```
