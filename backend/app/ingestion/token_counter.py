import tiktoken


EMBEDDING_MODEL = "text-embedding-3-small"


def get_tokenizer() -> tiktoken.Encoding:
    """
    Return the tokenizer used for the selected embedding model.

    If tiktoken does not recognize the model name, use the
    cl100k_base encoding as a fallback.
    """
    try:
        return tiktoken.encoding_for_model(EMBEDDING_MODEL)
    except KeyError:
        return tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str) -> int:
    """
    Count the number of tokens in a text string.
    """
    tokenizer = get_tokenizer()
    return len(tokenizer.encode(text, disallowed_special=()))