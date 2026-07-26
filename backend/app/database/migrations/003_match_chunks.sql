create or replace function public.match_chunks(
    query_embedding extensions.vector(1536),
    match_figure_id bigint,
    match_count integer default 5
)
returns table (
    id bigint,
    chunk_key text,
    document_id bigint,
    figure_id bigint,
    chunk_index integer,
    content text,
    character_count integer,
    token_count integer,
    metadata jsonb,
    similarity double precision
)
language sql
stable
as $$
    select
        chunks.id,
        chunks.chunk_key,
        chunks.document_id,
        chunks.figure_id,
        chunks.chunk_index,
        chunks.content,
        chunks.character_count,
        chunks.token_count,
        chunks.metadata,

        -- Cosine distance is returned by the <=> operator.
        -- Subtracting from 1 converts distance into similarity.
        1 - (chunks.embedding <=> query_embedding) as similarity

    from public.chunks

    where
        chunks.figure_id = match_figure_id
        and chunks.embedding is not null

    order by chunks.embedding <=> query_embedding

    limit match_count;
$$;