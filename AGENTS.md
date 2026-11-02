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

## NovaCharge
- Store data lives in a client-side state blob (src/lib/store); every admin action must go through src/lib/store/api.ts guards (requireAdmin checks owner email) — UI checks alone are not security.
- Theme tokens are CSS vars in src/styles.css (--nc-*); light mode remaps --color-white to slate so legacy white-alpha utilities stay legible — don't remove that remap.
