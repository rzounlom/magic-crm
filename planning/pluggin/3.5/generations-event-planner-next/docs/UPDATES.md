# WordPress dashboard updates — version 3.5.0

The plugin now includes native update discovery and release details. It keeps the
same plugin folder, main file and database option names. Existing inquiry records,
saved rates, mode and attachment selections are not deleted or reset by the updater.
The form and recommendation behavior from 3.4.0 remain included.

## One-time setup

1. Install the 3.5.0 ZIP once over the existing plugin using WordPress's **Replace
   current with uploaded** option. Do not delete or uninstall the existing plugin.
2. Publish the release ZIP and its `update.json` at a permanent public HTTPS
   directory under a domain you control. Hosting has NOT been connected or published
   by this deliverable. A file in this chat is not a permanent update server.
3. In **Event Planner → Plugin Updates**, enter the full HTTPS URL of `update.json`,
   save and click **Check for updates**. On multisite, use Network Admin → Plugins
   → Event Planner Updates. Only administrators allowed to update plugins can change
   this connection; the connection applies network-wide on multisite.
4. Confirm it reports the current published version. When a newer version is
   published, use **Update now** under Plugins or Dashboard → Updates. WordPress
   retains control of optional automatic installation; this plugin never enables it.

Updates still replace the plugin's program files internally. You no longer need
to download and upload each ZIP manually. Settings and inquiries live outside the
plugin directory. Custom changes made directly to plugin program files can still
be overwritten by a normal WordPress update.

## Publish each release

This is a private/self-hosted release channel, not a WordPress.org listing. It does
not include subscription billing, licensing or restricted paid downloads.

1. Implement and test the new version.
2. Increase both the main plugin **Version** header and `GAPNEXT_VERSION` constant.
3. Run the included Python builder. Replace the example URL with your actual host:

```bash
python3 tools/build-release.py \
  --output /absolute/path/outside-the-plugin/release \
  --base-url https://YOUR-UPDATE-HOST/releases \
  --changelog "Describe the tested changes in this release."
```

The builder produces a versioned installable ZIP (with the stable
`generations-event-planner-next/` root) and `update.json`. It refuses to overwrite
an existing versioned ZIP and checks that version numbers match. Python is needed
only on the publisher's computer; the WordPress plugin uses no Python dependency.

4. Upload the new ZIP to the directory first. Confirm it downloads successfully
   without a login wall and unzips into the correct folder. Keep prior ZIPs available
   while any cached feeds may still reference them.
5. Upload the new `update.json` last, replacing the previous feed atomically if your
   host supports that. Serve JSON directly with HTTP 200 (no redirect/login page).
6. Use **Check for updates**, inspect the release details, and test an actual update
   on staging before offering it to live venues. Retest settings, form submission,
   internal/customer email handling, and scheduled reports on staging.

The feed and ZIP must use HTTPS and the SAME hostname. Configure the canonical URL
rather than a URL that redirects (for example, use the final www or non-www host).
Use a trusted HTTPS host with controlled write access. Do not store customer data,
credentials or private documents in the public releases directory. Public release
ZIPs are downloadable by anyone who has the URL; paid distribution needs a separate
licensing/access layer before you sell downloads.

## Configuration, caching and failures

- No update-server requests occur until a feed is configured.
- The feed receives a plain GET request. Inquiries, contact information, license
  keys and the venue's site URL are not added to the request. Like any web server,
  the host can observe the requesting server's IP address and the supplied plugin
  version user-agent.
- Valid feeds are cached for six hours; failed checks for fifteen minutes.
  **Check for updates** bypasses the plugin cache and refreshes WordPress's list.
- Invalid JSON, mismatched plugin identifiers, invalid compatibility versions,
  non-HTTPS/private-network URLs and cross-host package URLs are rejected.
- An unavailable feed does not disable forms or erase settings. WordPress continues
  running the installed version. The settings page displays connection errors.
- Ordinary WordPress update requirements, filesystem credentials and host policies
  still apply. Installation is performed by WordPress core, not a custom installer.

A developer can preconfigure the same connection for all supplied installations by
adding this in wp-config.php (before WordPress loads). Use the actual published URL:

```php
define('GAPNEXT_UPDATE_FEED_URL', 'https://YOUR-UPDATE-HOST/releases/update.json');
```

While the constant is present, the feed field is read-only. No constant is shipped
with a guessed or unverified endpoint.

## Verification performed here

The updater's hooks, feed validation, caching, error paths, plugin isolation,
release information and update response are tested with local WordPress test
doubles and intercepted HTTP calls. The existing engine/audit/refinement suites
are rerun. No update server or live WordPress site has been changed. Actual ZIP
installation through a hosted feed is a required staging check after hosting is set.

Primary WordPress references:
- https://developer.wordpress.org/reference/hooks/update_plugins_hostname/
- https://developer.wordpress.org/reference/functions/wp_update_plugins/
- https://developer.wordpress.org/reference/hooks/plugins_api/
