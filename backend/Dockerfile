FROM python:3.11-slim

WORKDIR /app

COPY requirements.prod.txt .
RUN pip install --no-cache-dir -r requirements.prod.txt --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/

COPY . .

RUN mkdir -p uploads

EXPOSE 8000

CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}
