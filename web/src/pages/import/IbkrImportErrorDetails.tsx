type IbkrImportErrorDetailsProps = {
  missingIsins?: string[] | null;
  ambiguousIsins?: string[] | null;
  missingSymbols?: string[] | null;
  ambiguousSymbols?: string[] | null;
};

function CodeList({ items }: { items: string[] | null | undefined }) {
  if (items == null || items.length === 0) {
    return null;
  }
  return (
    <ul className="mt-2 list-disc space-y-0.5 pl-5">
      {items.map((item) => (
        <li key={item} className="break-words font-mono text-sm">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function IbkrImportErrorDetails({
  missingIsins,
  ambiguousIsins,
  missingSymbols,
  ambiguousSymbols,
}: IbkrImportErrorDetailsProps) {
  return (
    <>
      <CodeList items={missingIsins} />
      <CodeList items={ambiguousIsins} />
      <CodeList items={missingSymbols} />
      <CodeList items={ambiguousSymbols} />
    </>
  );
}
