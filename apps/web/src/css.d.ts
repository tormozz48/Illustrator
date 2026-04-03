/** Type declaration for CSS Modules — Vite handles transforms at build time */
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
