// Temporary type shim to satisfy TS until `openai` is installed.
// Remove this after adding the real dependency: `npm i openai`.
declare module 'openai' {
  const DefaultExport: any;
  export default DefaultExport;
}

