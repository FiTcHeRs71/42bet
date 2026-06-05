// Fond d'ambiance : halos violet/cyan fixes derrière tout le contenu.
// Server component sans état, aucun JS. Purement décoratif (aria-hidden).
export function AppBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div
        className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full opacity-40 blur-[90px]"
        style={{ background: "var(--accent)" }}
      />
      <div
        className="absolute -bottom-40 -right-24 h-[26rem] w-[26rem] rounded-full opacity-35 blur-[90px]"
        style={{ background: "var(--cyan)" }}
      />
    </div>
  );
}
