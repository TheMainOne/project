# ECN rules and private configuration

The committed ruleset contains departments and controlled workflow facts, but
never employee names or confidential source documents. `Product Management`
uses the selected row's live `Product Manager` value when it is available.

For fallback approvers/delegates, copy the shape in
`participant-roster.example.json` into the `participantRoster` property of an
imported `.ecn-private/*.draft.json` file. Review the draft and conflict report,
then activate that exact private file with `npm run ecn:activate`. The resulting
active ruleset remains under `.ecn-private/`, which is excluded from Git.

Import and activation are deliberately separate:

```powershell
npm run ecn:import -- --source "C:\path\to\controlled-sources"
npm run ecn:activate -- --draft ".ecn-private\<version>.draft.json" --reviewed-by "Reviewer"
```

Activation refuses unresolved conflicts unless the reviewer explicitly passes
`--accept-conflicts`. Accepted conflict/provisional/comment evidence still
remains `Needs confirmation`; it cannot become a blocker.
