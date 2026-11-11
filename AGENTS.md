<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project architecture

- Platform admin route shells disable automatic route splitting because their pages already use React.lazy; this avoids a second component-chunk loading boundary.

- Tenant creation rejects duplicate owner emails before inserting a tenant and never reuses or changes existing Auth accounts; rollback deletes only the newly created owner.

- Tenant APKs load the packaged app offline, then switch to `https://iftinagents.com/t/<slug>` online so published web UI changes reach installed apps.
- Android keyboard layout has one resize owner: native `adjustResize`; web code only scrolls the focused field within the resulting visible viewport.
- Tenant APK startup keeps one native overlay over local-to-live navigation and removes it only after the web app renders its ready surface; this prevents stacked splash screens and blank WebView frames.
