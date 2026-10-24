# Bundled local search dependencies

- Transformers.js, Hugging Face, Apache License 2.0: https://github.com/huggingface/transformers.js/blob/main/LICENSE
- Tokenizers.js, Hugging Face, Apache License 2.0: https://github.com/huggingface/tokenizers.js
- Jinja.js, Hugging Face, MIT License: https://github.com/huggingface/jinja.js
- ONNX Runtime, Microsoft, MIT License: https://github.com/microsoft/onnxruntime/blob/main/LICENSE
- Browser retrieval: BGE-small-en-v1.5, Beijing Academy of Artificial Intelligence, MIT License: https://huggingface.co/BAAI/bge-small-en-v1.5
- Browser ONNX conversion: Xenova/bge-small-en-v1.5, revision ea104dacec62c0de699686887e3f920caeb4f3e3. Model source: https://huggingface.co/Xenova/bge-small-en-v1.5
- Local query/passage reranker: cross-encoder/ms-marco-MiniLM-L6-v2, Apache License 2.0: https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2
- Reranker ONNX conversion: Xenova/ms-marco-MiniLM-L-6-v2, revision a09144355adeed5f58c8ed011d209bf8ee5a1fec: https://huggingface.co/Xenova/ms-marco-MiniLM-L-6-v2
- Native Claude mod only: all-MiniLM-L6-v2, Sentence Transformers, Apache License 2.0: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
- Native mod ONNX conversion: Xenova/all-MiniLM-L6-v2, revision 751bff37182d3f1213fa05d7196b954e230abad9. Model source: https://huggingface.co/Xenova/all-MiniLM-L6-v2

The model and inference runtime are packaged with the extension. Searches never invoke an external AI service. The prepared model manifest records file sizes and SHA-256 hashes. Full license texts are included under licenses/ in the distribution.
