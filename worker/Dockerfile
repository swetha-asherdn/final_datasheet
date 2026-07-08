FROM python:3.12-slim

WORKDIR /app

# Runtime tools for PyMuPDF/pdfplumber previews, OCRmyPDF/Tesseract OCR, qpdf validation, and Camelot/OpenCV.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    ghostscript \
    qpdf \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    poppler-utils \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
