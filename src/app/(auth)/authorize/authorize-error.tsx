interface Props {
  title: string;
  body: string;
}

export function AuthorizeError({ title, body }: Props) {
  return (
    <div className="w-full max-w-md mx-auto text-center">
      <h1 className="font-serif text-2xl font-bold tracking-[0.08em] mb-3">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
