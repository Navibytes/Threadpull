"""Threadpull API. Minimal app for ticket 02; ticket 01 (walking skeleton) extends it."""

from fastapi import FastAPI, HTTPException

from backend.ingest import load_portfolio

app = FastAPI(title="Threadpull")


@app.get("/loans")
def list_loans(seed: int = 13, include_documents: bool = False) -> list[dict]:
    """Filing drawer: normalized loans with their current status."""
    try:
        loans = load_portfolio(seed)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    if include_documents:
        return list(loans)
    return [{k: v for k, v in ln.items() if k != "documents"} for ln in loans]
