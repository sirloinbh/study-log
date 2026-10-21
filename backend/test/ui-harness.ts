import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

export type Node = { type: unknown; props: Record<string, unknown> & { children: unknown[] } };
export type FetchInit = { method?: string; headers?: Record<string, string>; body?: string };
export type FetchImpl = (
  path: string,
  init?: FetchInit,
) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;

// The backend-only deploy repository (subtree) has no frontend/ folder; the umbrella CI runs these.
// Check the folder, not main.tsx, so a moved or renamed entry file still fails there instead of skipping.
export const frontendMissing = !existsSync(new URL('../../frontend/', import.meta.url));

const sourceUrl = (file: string) => new URL('../../frontend/src/' + file, import.meta.url);

// Loads frontend modules into one VM context so errors and objects share a realm.
function moduleLoader(context: object, external: (name: string) => unknown) {
  const cache = new Map<string, unknown>();
  const load = (file: string): unknown => {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const code = ts.transpileModule(readFileSync(sourceUrl(file), 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    }).outputText;
    const run = runInContext(`(function (exports, require) {${code}\n})`, context) as (
      exports: object,
      require: (name: string) => unknown,
    ) => void;
    run(exports, (name) => {
      if (name.endsWith('.css')) return {};
      if (!name.startsWith('./')) return external(name);
      const base = name.slice(2);
      const file = [base + '.ts', base + '.tsx'].find((f) => existsSync(sourceUrl(f)));
      if (!file) throw new Error('Unexpected import: ' + name);
      return load(file);
    });
    return exports;
  };
  return load;
}

// Plain (non-React) frontend modules for unit tests.
export function loadFrontendModule<T>(file: string): T {
  return moduleLoader(createContext({}), (name) => {
    throw new Error('Unexpected import: ' + name);
  })(file) as T;
}

// Minimal React stand-in: renders function components and supports useState/useEffect.
export function mount(fetchImpl: FetchImpl) {
  const states: unknown[] = [];
  const effectDeps: unknown[][] = [];
  let cursor = 0;
  let pending: (() => void)[] = [];
  let element: Node | undefined;
  const react = {
    Fragment: 'fragment',
    createElement: (
      type: unknown,
      props: Record<string, unknown> | null,
      ...children: unknown[]
    ) => ({
      type,
      props: { ...(props ?? {}), children: children.flat() },
    }),
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in states))
        states[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [
        states[index],
        (next: unknown) => {
          states[index] =
            typeof next === 'function' ? (next as (v: unknown) => unknown)(states[index]) : next;
        },
      ];
    },
    useEffect(effect: () => void, deps?: unknown[]) {
      const index = cursor++;
      const previous = effectDeps[index];
      if (!deps || !previous || deps.some((d, i) => d !== previous[i])) {
        effectDeps[index] = deps ?? [];
        pending.push(effect);
      }
    },
  };
  const context = createContext({
    document: { getElementById: () => ({}) },
    fetch: fetchImpl,
    console,
  });
  moduleLoader(context, (name) => {
    if (name === 'react') return react;
    if (name === 'react-dom/client')
      return { createRoot: () => ({ render: (v: Node) => (element = v) }) };
    if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
    throw new Error('Unexpected import: ' + name);
  })('main.tsx');
  const resolve = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(resolve);
    if (!node || typeof node !== 'object') return node;
    const { type, props } = node as Node;
    if (typeof type === 'function') return resolve(type(props));
    return { type, props: { ...props, children: props.children.map(resolve) } };
  };
  let tree: unknown;
  const render = () => {
    cursor = 0;
    tree = resolve(element);
  };
  const settle = async () => {
    for (let i = 0; i < 8; i++) {
      render();
      const effects = pending;
      pending = [];
      effects.forEach((effect) => effect());
      await new Promise((r) => setImmediate(r));
    }
    render();
  };
  // No default parameters: an `undefined` child (from `{x && <p/>}`) must not restart at the root.
  const textOf = (node: unknown): string =>
    Array.isArray(node)
      ? node.map(textOf).join('')
      : node && typeof node === 'object'
        ? textOf((node as Node).props.children)
        : node === null || node === undefined || node === false
          ? ''
          : String(node);
  const findIn = (match: (n: Node) => boolean, node: unknown): Node[] => {
    if (Array.isArray(node)) return node.flatMap((child) => findIn(match, child));
    if (!node || typeof node !== 'object') return [];
    const current = node as Node;
    return [...(match(current) ? [current] : []), ...findIn(match, current.props.children)];
  };
  const text = (...nodes: unknown[]) => textOf(nodes.length ? nodes[0] : tree);
  const find = (match: (n: Node) => boolean, ...nodes: unknown[]) =>
    findIn(match, nodes.length ? nodes[0] : tree);
  const click = async (label: string, ...scope: unknown[]) => {
    const [button] = findIn(
      (n) => n.type === 'button' && textOf(n).includes(label),
      scope.length ? scope[0] : tree,
    );
    assert.ok(button, 'button ' + label);
    assert.ok(!button.props.disabled, 'button ' + label + ' is disabled');
    // Not awaited: like a browser, the click returns while the handler's request is in flight.
    void (button.props.onClick as () => unknown)();
    await settle();
  };
  // Types into the input, select or textarea inside the <label> whose text starts with `label`.
  const fill = async (label: string, value: string) => {
    const [field] = find((n) => n.type === 'label' && text(n).startsWith(label)).flatMap((n) =>
      find((c) => ['input', 'select', 'textarea'].includes(String(c.type)), n),
    );
    assert.ok(field, 'field ' + label);
    (field.props.onChange as (e: { target: { value: string } }) => void)({ target: { value } });
    await settle();
  };
  const field = (label: string) =>
    find((n) => n.type === 'label' && text(n).startsWith(label)).flatMap((n) =>
      find((c) => ['input', 'select', 'textarea'].includes(String(c.type)), n),
    )[0]?.props.value;
  const submit = async () => {
    const [form] = find((n) => n.type === 'form');
    assert.ok(form, 'form');
    void (form.props.onSubmit as (e: { preventDefault(): void }) => unknown)({
      preventDefault() {},
    });
    await settle();
  };
  return { settle, text, find, click, fill, field, submit };
}
