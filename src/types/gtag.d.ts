interface Window {
  dataLayer: unknown[];
  gtag: GtagFunction;
}

type GtagFunction = (
  command: 'js' | 'config' | 'event' | 'set',
  ...args: unknown[]
) => void;
