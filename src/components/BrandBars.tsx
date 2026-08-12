/** Three prompt bars — teal → sky → sand — signature motif from the brand mark. */
export default function BrandBars({
  className = '',
  size = 'sm',
}: {
  className?: string;
  size?: 'sm' | 'md';
}) {
  const gap = size === 'md' ? 'gap-1' : 'gap-0.5';
  const bar = size === 'md' ? 'h-1 rounded-full' : 'h-0.5 rounded-full';
  return (
    <span className={`inline-flex flex-col justify-center ${gap} ${className}`.trim()} aria-hidden>
      <span className={`${bar} w-3 bg-[rgb(94_234_212)]`} />
      <span className={`${bar} w-2.5 bg-[rgb(56_189_248)] opacity-90`} />
      <span className={`${bar} w-[0.7rem] bg-[rgb(240_171_124)] opacity-85`} />
    </span>
  );
}
