# RubberSegment

JavaScript + plain CSS React Bits component supplied in the user's pasted
`Pasted text.txt` attachment on 16 October 2026. The source was taken from the
attachment's **Full Component Source** and **Component CSS** blocks, rather than
reconstructed from a screenshot or substituted with a different control.

Library reference: <https://reactbits.dev/llms.txt>.

`RubberSegment.jsx` exports the component as its default export and imports its
adjacent stylesheet. Its only listed dependency, `motion`, is installed at
**14.3.0** (`motion/react` is the component's import). The existing React and
React DOM versions remain **19.3.1**.

## Small accessibility correction

The supplied JSX commits selections through pointer release and arrow/Home/End
keys, but has no click handler for native Enter/Space or assistive-technology
activation. The vendored JSX adds one `onClick` handler to each radio button:

```jsx
onClick={e => {
  if (disabled || e.detail !== 0 || i === committed.current) return;
  const from = committed.current;
  commit(i);
  travel(from, i);
}}
```

Only clicks with `detail === 0` use this path. Pointer-generated clicks retain
the original pointer handlers, so a pointer interaction does not commit twice.
Disabled controls and already committed items remain unchanged. The handler
uses the component's existing commit/travel functions, including its reduced
motion behavior. No other JSX behavior was changed; the CSS is unchanged.

The application's admin navigation bridge owns route changes, content and
design-token overrides. Keep application-specific styling outside these
vendored source files.
