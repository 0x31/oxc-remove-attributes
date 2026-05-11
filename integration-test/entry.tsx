// Exercise a range of attribute shapes so verify.js can assert they're all
// removed from the built bundle.
import { type ReactNode } from "react";

const id = "header";
const items = [{ id: 1, name: "a" }];

export const Header = (): ReactNode => (
  <header data-testid="header" className="row">
    <span data-testid={`label-${id}`}>Hello</span>
    <button data-cy="click-me" data-testid="btn" type="button">
      Press
    </button>
  </header>
);

export const List = (): ReactNode => (
  <ul>
    {items.map((i) => (
      <li data-testid={i.id} key={i.id}>
        {i.name}
      </li>
    ))}
  </ul>
);

// These should NOT be touched: spread, namespaced, comment text, string text.
export const Edge = (): ReactNode => (
  <svg xlink:href="#a" {...{ role: "img" }}>
    <title>{'data-testid="not-jsx"'}</title>
  </svg>
);

// Comment with data-testid="should-remain-in-comments-if-anything"
export default "ok";
