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

- Tenant APKs load the packaged app offline, then switch to `https://iftinagents.com/t/<slug>` online so published web UI changes reach installed apps.
- Android keyboard layout has one resize owner: native `adjustResize`; web code only scrolls the focused field within the resulting visible viewport.
