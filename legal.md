# Terms of Service & Privacy Policy

Last updated: October 2026. This document applies to Anchors Arcade X, an unofficial, independently modified build based on the open-source Plutonium project.

## Terms of Service

Welcome to Anchors Arcade X. By accessing or using this platform you agree to the terms below. If you do not agree, please do not use it.

### About this build

Anchors Arcade X is a modified version of [Plutonium](https://github.com/Plutonium-Net/Plutonium) by [Plutonium-Net](https://github.com/Plutonium-Net), distributed under the [Plutonium License (PL) v1.0](LICENSE). It is **not** the official Plutonium project and is **not** affiliated with, endorsed by, or sponsored by Plutonium-Net or the original developers. The original project and its creators deserve the credit for the underlying platform.

### Acceptable use

* Use the platform for personal, educational, and non-commercial purposes only.
* Do not use the platform in a way that violates the terms of any website, service, or network you access.
* Do not attempt to disrupt, overload, or attack the platform or any third-party service it relies on.
* Content available through the platform (games, media, websites) belongs to its respective owners and is subject to their own terms.
* You are responsible for complying with the rules of any school, workplace, or network you use to access this platform.

### Availability and warranty

Anchors Arcade X is provided **"as is"** and **"as available"**, without warranty of any kind. Features may break or stop working without notice, and no guarantee is made that the platform will be available at any particular time.

Several features depend on external services that this build does not operate (see the list below). If those services change or shut down, the related features will stop working. This is a limitation of the platform, not a fault you can report for a fix.

### Liability

To the maximum extent permitted by law, the operators of Anchors Arcade X are not liable for any damages arising from your use of the platform.

## Privacy Policy

This section describes, honestly and briefly, what data Anchors Arcade X handles and where it goes. Anchors Arcade X is a static website: there is no custom backend of its own, but the platform does talk to third-party services inherited from the original project.

### Data stored in your browser

The platform stores settings and cached content in your browser (`localStorage`, IndexedDB, and a service-worker cache). Examples include your theme and accent preferences, open tabs, recent history, and any personal games you add. This data stays on your device unless a feature explicitly syncs it (see below). Clearing your browser data removes it.

### Data sent to external services

The following features rely on services operated by others. When you use them, data is sent to those services:

* **Accounts and sync.** If you create an account or sign in, your credentials and synced data (such as tabs and recent history) are handled by a Firebase-based authentication and storage backend operated as part of the original project's infrastructure.
* **AI assistant.** Chat messages you send to the Anchors AI (Stelena) assistant are transmitted to an external AI worker (Groq) for processing.
* **Browsing engines.** The built-in browsing engines route web traffic through relay servers operated by the original project's infrastructure. Any website you visit through them can see that traffic as it would from any proxy.
* **Cloud gaming and VMs.** The cloud gaming and virtual machine features embed third-party services (such as Hyperbeam). Their own privacy policies apply.

If you do not use a feature, it does not send the associated data. You can use most of the platform (games, tabs, themes) without an account.

### Analytics and tracking

No custom analytics or tracking has been added to Anchors Arcade X. The original platform's build-update and announcement features fetch configuration from the original project's infrastructure.

### Your choices

* Do not sign in to avoid account-related data handling.
* Do not use the AI, browsing, cloud gaming, or VM features to avoid sending data to those services.
* Clear your browser's site data to remove everything stored locally.

### Contact

This is an independent project. For questions about this build, open an issue in its repository. For questions about the original Plutonium platform and its services, refer to the [original project](https://github.com/Plutonium-Net/Plutonium).
