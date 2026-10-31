import json
import os
import time
import torch
from transformers import AutoTokenizer, AutoModel

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOTES = os.path.join(BASE, '90_元数据', 'notes.index.json')
INTERACTIONS = os.path.join(BASE, '.private', 'interactions.index.json')
OUT = os.path.join(BASE, '90_元数据', 'embeddings.json')
MODEL = 'BAAI/bge-small-zh-v1.5'


def text_of_note(n):
    return ' '.join(str(x) for x in [n.get('title', ''), n.get('body', ''), n.get('project', '')] + list(n.get('tags') or []) + list(n.get('people') or []) if x)


def text_of_interaction(it):
    return ' '.join(str(x) for x in [it.get('project', ''), it.get('user', ''), it.get('assistant', ''), it.get('title', '')] if x)


def main():
    notes = json.load(open(NOTES, encoding='utf-8')).get('notes', [])
    interactions = json.load(open(INTERACTIONS, encoding='utf-8')).get('interactions', [])
    docs = [{'id': n['id'], 'text': text_of_note(n)} for n in notes]
    docs += [{'id': x['id'], 'text': text_of_interaction(x)} for x in interactions]
    print('docs', len(docs), 'model', MODEL, flush=True)
    tokenizer = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModel.from_pretrained(MODEL)
    model.eval()
    vectors = {}
    t0 = time.time()
    with torch.no_grad():
        for start in range(0, len(docs), 16):
            batch = docs[start:start + 16]
            enc = tokenizer([d['text'] for d in batch], padding=True, truncation=True, max_length=512, return_tensors='pt')
            out = model(**enc).last_hidden_state[:, 0]
            out = torch.nn.functional.normalize(out, p=2, dim=1)
            for d, vec in zip(batch, out):
                vectors[d['id']] = [round(float(x), 5) for x in vec.tolist()]
            if start % 80 == 0:
                print('encoded', start + len(batch), '/', len(docs), f'{time.time()-t0:.1f}s', flush=True)
    payload = {
        'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'method': 'bge-small-zh-v1.5 / CLS pooling / L2 normalized',
        'model': MODEL,
        'dim': 512,
        'total': len(vectors),
        'vectors': vectors,
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
    print('wrote', OUT, os.path.getsize(OUT), 'bytes', f'{time.time()-t0:.1f}s', flush=True)


if __name__ == '__main__':
    main()
