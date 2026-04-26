import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { useStudy } from '../context/StudyContext';

export default function Upload({ theme, toggleTheme }) {
  const router = useRouter();
  const { uploadedFiles, addFile, updateFile, removeFile } = useStudy();
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const allReady = uploadedFiles.length > 0 &&
    uploadedFiles.every(f => f.progress === 100 || f.readError);

  async function processFile(file) {
    const lname = file.name.toLowerCase();
    const isPdf = file.type === 'application/pdf' || lname.endsWith('.pdf');
    const isDocx = lname.endsWith('.docx') || file.type.includes('wordprocessingml');
    const isText = file.type.startsWith('text/') || lname.endsWith('.txt') || lname.endsWith('.md');
    const isImage = file.type.startsWith('image/');

    const fileObj = {
      name: file.name, size: file.size,
      type: isPdf ? 'PDF' : isDocx ? 'Doc' : isImage ? 'Image' : 'File',
      mimeType: file.type, progress: 0, readError: null,
      textContent: null, imageData: null,
    };
    addFile(fileObj);

    if (file.size > 75 * 1024 * 1024) {
      updateFile(file.name, { readError: 'File too large (max 75 MB)', progress: 100 });
      return;
    }

    // Animate progress bar until actual read completes
    let prog = 0;
    const tick = setInterval(() => {
      prog = Math.min(prog + (file.size > 4 * 1024 * 1024 ? 3 : 10), 85);
      updateFile(file.name, { progress: prog });
    }, 100);

    try {
      if (isText) {
        const text = await file.text();
        clearInterval(tick);
        updateFile(file.name, { textContent: text, progress: 100 });
      } else if (isImage) {
        const b64 = await toBase64(file);
        clearInterval(tick);
        updateFile(file.name, { imageData: b64, progress: 100 });
      } else if (isPdf || isDocx) {
        if (file.size <= 4 * 1024 * 1024) {
          const b64 = await toBase64(file);
          const res = await fetch('/.netlify/functions/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: file.name, mimeType: file.type, data: b64 }),
          });
          const result = await res.json();
          clearInterval(tick);
          if (res.ok && result.text) {
            updateFile(file.name, { textContent: result.text, progress: 100 });
          } else {
            updateFile(file.name, { readError: result.error || 'Extraction failed', progress: 100 });
          }
        } else if (isPdf) {
          clearInterval(tick);
          const text = await extractPdfClient(file, (p) => updateFile(file.name, { progress: p }));
          if (text) updateFile(file.name, { textContent: text, progress: 100 });
          else updateFile(file.name, { readError: 'No text found — may be a scanned image PDF', progress: 100 });
        } else {
          // Large DOCX — client-side mammoth
          if (!window.mammoth) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.4.2/mammoth.browser.min.js');
          const ab = await file.arrayBuffer();
          const result = await window.mammoth.extractRawText({ arrayBuffer: ab });
          clearInterval(tick);
          updateFile(file.name, { textContent: result.value || '', progress: 100 });
        }
      } else {
        clearInterval(tick);
        updateFile(file.name, { readError: 'Unsupported file type', progress: 100 });
      }
    } catch (e) {
      clearInterval(tick);
      updateFile(file.name, { readError: e.message || 'Read failed', progress: 100 });
    }
  }

  function toBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  async function extractPdfClient(file, onProgress) {
    if (!window.pdfjsLib) {
      await loadScript('/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
    }
    const ab = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
      onProgress(Math.round(10 + (i / pdf.numPages) * 85));
      if (text.length > 25000) break;
    }
    return text.trim();
  }

  function handleFiles(files) {
    Array.from(files).forEach(f => processFile(f));
  }

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, []);

  return (
    <Layout theme={theme} toggleTheme={toggleTheme}>
      <div className="upload-page fade-up">
        <div className="step-header">
          <div className="step-badge">Step 1 of 3</div>
          <h1>Upload your materials</h1>
          <p>PDF, Word docs, text files, or images — up to 75 MB each</p>
        </div>

        <div
          className={`drop-zone${dragging ? ' dragging' : ''}${uploadedFiles.length ? ' has-files' : ''}`}
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => !uploadedFiles.length && fileInputRef.current?.click()}
        >
          {!uploadedFiles.length ? (
            <div className="drop-empty">
              <div className="drop-icon">📂</div>
              <div className="drop-title">Drop files here</div>
              <div className="drop-sub">or click to browse</div>
              <div className="drop-types">PDF · DOCX · TXT · PNG · JPG</div>
            </div>
          ) : (
            <div className="file-list">
              {uploadedFiles.map(f => (
                <FileRow key={f.name} file={f} onRemove={() => removeFile(f.name)} />
              ))}
            </div>
          )}
        </div>

        {uploadedFiles.length > 0 && (
          <div className="upload-actions">
            <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
              + Add Another File
            </button>
            <button className="btn-primary" disabled={!allReady} onClick={() => router.push('/select')}>
              Next →
            </button>
          </div>
        )}

        <input
          ref={fileInputRef} type="file" multiple
          accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp"
          style={{ display: 'none' }}
          onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
        />
      </div>
    </Layout>
  );
}

function FileRow({ file, onRemove }) {
  const icon = { PDF: '📄', Doc: '📝', Image: '🖼️' }[file.type] || '📎';
  const pct = file.progress || 0;
  const done = pct >= 100;

  return (
    <div className="file-row">
      <div className="file-row-icon">{icon}</div>
      <div className="file-row-info">
        <div className="file-row-name">{file.name}</div>
        {file.readError ? (
          <div className="file-row-error">⚠ {file.readError}</div>
        ) : done ? (
          <div className="file-row-done">✓ Ready</div>
        ) : (
          <div className="file-progress">
            <div className="file-progress-bar" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      {!done && <div className="file-row-pct">{Math.round(pct)}%</div>}
      <button className="file-row-remove" onClick={onRemove}>✕</button>
    </div>
  );
}
