interface AppLoadingScreenProps {
  compact?: boolean;
}

/**
 * The loading state is deliberately self-contained and dependency-light. It is
 * the first UI the browser can paint while IndexedDB hydration and lazy chunks
 * are still resolving, so a slow first load never looks like a crashed tab.
 */
export function AppLoadingScreen({ compact = false }: AppLoadingScreenProps): JSX.Element {
  return (
    <div
      className={`relative grid place-items-center overflow-hidden bg-[#0b0f19] px-6 text-white ${
        compact ? 'fixed inset-0 z-[60] min-h-0' : 'h-full min-h-full w-full'
      }`}
      role="status"
      aria-live="polite"
      aria-label="SciRender đang khởi tạo"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(56,189,248,.13), transparent 34%), radial-gradient(circle at 50% 58%, rgba(29,78,216,.10), transparent 48%)',
        }}
      />

      <div className="relative z-10 flex max-w-md flex-col items-center text-center">
        <div className={`relative ${compact ? 'h-24 w-24' : 'h-32 w-32'}`} aria-hidden="true">
          <span className="sr-loading-orbit sr-loading-orbit-a" />
          <span className="sr-loading-orbit sr-loading-orbit-b" />
          <span className="sr-loading-orbit sr-loading-orbit-c" />
          <span className="sr-loading-core">Σ</span>
          <span className="sr-loading-particle sr-loading-particle-a" />
          <span className="sr-loading-particle sr-loading-particle-b" />
          <span className="sr-loading-particle sr-loading-particle-c" />
        </div>

        <div className="mt-5 font-serif text-[24px] tracking-[-0.02em] text-slate-100">
          Sci<span className="text-sky-300">Render</span>
        </div>
        <p className="mt-2 max-w-sm text-[13px] leading-6 text-slate-300">
          Đang khởi tạo môi trường biên dịch tài liệu SciRender...
        </p>
        <p className="mt-3 font-mono text-[10.5px] tracking-[0.02em] text-slate-400">
          ✓ AST Pipeline <span className="text-sky-400/70">•</span> ✓ Precision Pagination{' '}
          <span className="text-sky-400/70">•</span> ✓ Local-first Storage
        </p>
      </div>

      <style>{`
        .sr-loading-orbit{
          position:absolute;
          inset:50% auto auto 50%;
          border:1px solid rgba(125,211,252,.28);
          border-radius:9999px;
          transform-origin:center;
          box-shadow:0 0 18px rgba(56,189,248,.08), inset 0 0 12px rgba(56,189,248,.04);
        }
        .sr-loading-orbit-a{width:88%;height:34%;transform:translate(-50%,-50%) rotate(18deg);animation:sr-orbit-a 3.8s linear infinite;}
        .sr-loading-orbit-b{width:88%;height:34%;transform:translate(-50%,-50%) rotate(-48deg);animation:sr-orbit-b 4.8s linear infinite reverse;}
        .sr-loading-orbit-c{width:88%;height:34%;transform:translate(-50%,-50%) rotate(78deg);animation:sr-orbit-c 5.6s linear infinite;}
        .sr-loading-core{
          position:absolute;
          left:50%;top:50%;
          display:grid;place-items:center;
          width:34%;height:34%;
          transform:translate(-50%,-50%);
          border:1px solid rgba(96,165,250,.5);
          border-radius:9999px;
          background:radial-gradient(circle,rgba(30,64,175,.5),rgba(11,15,25,.92) 72%);
          color:#e0f2fe;
          font-family:Georgia,'Times New Roman',serif;
          font-size:1.45rem;
          box-shadow:0 0 22px rgba(37,99,235,.25),0 0 50px rgba(14,165,233,.10);
          animation:sr-core-pulse 2.2s ease-in-out infinite;
        }
        .sr-loading-particle{position:absolute;left:50%;top:50%;width:6px;height:6px;border-radius:9999px;background:#7dd3fc;box-shadow:0 0 10px #38bdf8;}
        .sr-loading-particle-a{animation:sr-particle-a 3.8s linear infinite;}
        .sr-loading-particle-b{animation:sr-particle-b 4.8s linear infinite reverse;}
        .sr-loading-particle-c{animation:sr-particle-c 5.6s linear infinite;}
        @keyframes sr-orbit-a{from{transform:translate(-50%,-50%) rotate(18deg) rotateX(66deg) rotateZ(0deg)}to{transform:translate(-50%,-50%) rotate(18deg) rotateX(66deg) rotateZ(360deg)}}
        @keyframes sr-orbit-b{from{transform:translate(-50%,-50%) rotate(-48deg) rotateX(66deg) rotateZ(0deg)}to{transform:translate(-50%,-50%) rotate(-48deg) rotateX(66deg) rotateZ(360deg)}}
        @keyframes sr-orbit-c{from{transform:translate(-50%,-50%) rotate(78deg) rotateX(66deg) rotateZ(0deg)}to{transform:translate(-50%,-50%) rotate(78deg) rotateX(66deg) rotateZ(360deg)}}
        @keyframes sr-particle-a{from{transform:translate(-50%,-50%) rotate(18deg) rotateZ(0deg) translateX(43px)}to{transform:translate(-50%,-50%) rotate(18deg) rotateZ(360deg) translateX(43px)}}
        @keyframes sr-particle-b{from{transform:translate(-50%,-50%) rotate(-48deg) rotateZ(0deg) translateX(43px)}to{transform:translate(-50%,-50%) rotate(-48deg) rotateZ(360deg) translateX(43px)}}
        @keyframes sr-particle-c{from{transform:translate(-50%,-50%) rotate(78deg) rotateZ(0deg) translateX(43px)}to{transform:translate(-50%,-50%) rotate(78deg) rotateZ(360deg) translateX(43px)}}
        @keyframes sr-core-pulse{0%,100%{transform:translate(-50%,-50%) scale(.96);filter:brightness(.95)}50%{transform:translate(-50%,-50%) scale(1.04);filter:brightness(1.12)}}
        @media (prefers-reduced-motion:reduce){.sr-loading-orbit,.sr-loading-particle,.sr-loading-core{animation:none!important}}
      `}</style>
    </div>
  );
}
