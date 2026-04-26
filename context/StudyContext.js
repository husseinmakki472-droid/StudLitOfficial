import { createContext, useContext, useState, useCallback } from 'react';

const StudyContext = createContext(null);

export function StudyProvider({ children }) {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [selectedMethods, setSelectedMethods] = useState([]);
  const [language, setLanguage] = useState('English');
  const [topic, setTopic] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeMethod, setActiveMethod] = useState(null);

  const addFile = useCallback((fileObj) => {
    setUploadedFiles(prev => [...prev.filter(f => f.name !== fileObj.name), fileObj]);
  }, []);

  const updateFile = useCallback((name, updates) => {
    setUploadedFiles(prev => prev.map(f => f.name === name ? { ...f, ...updates } : f));
  }, []);

  const removeFile = useCallback((name) => {
    setUploadedFiles(prev => prev.filter(f => f.name !== name));
  }, []);

  const toggleMethod = useCallback((id) => {
    setSelectedMethods(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  }, []);

  const generate = useCallback(async () => {
    if (!selectedMethods.length) return;
    setLoading(true);
    setError(null);

    const studyModes = selectedMethods.filter(m => m !== 'podcast');
    const hasPodcast = selectedMethods.includes('podcast');

    try {
      const filesPayload = uploadedFiles.map(f => ({
        name: f.name,
        type: f.type,
        mimeType: f.mimeType || null,
        textContent: f.textContent ? String(f.textContent).replace(/[\uD800-\uDFFF]/g, '?') : null,
        imageData: f.imageData || null,
      }));

      const fileContext = uploadedFiles
        .filter(f => f.textContent)
        .map(f => f.textContent.slice(0, 3000))
        .join('\n\n');

      const newResults = {};
      let resolvedTopic = topic;

      if (studyModes.length > 0) {
        const res = await fetch('/.netlify/functions/study', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: topic || 'the uploaded content',
            modes: studyModes,
            files: filesPayload,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Generation failed');
        if (data.results) Object.assign(newResults, data.results);
        if (data.topic && !topic) { resolvedTopic = data.topic; setTopic(data.topic); }
      }

      if (hasPodcast) {
        const res = await fetch('/.netlify/functions/podcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: resolvedTopic || 'the uploaded content', context: fileContext }),
        });
        const data = await res.json();
        if (res.ok && data.script) newResults.podcast = { script: data.script };
      }

      setResults(newResults);
      setActiveMethod(selectedMethods[0]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [uploadedFiles, selectedMethods, language, topic]);

  return (
    <StudyContext.Provider value={{
      uploadedFiles, addFile, updateFile, removeFile,
      selectedMethods, toggleMethod, setSelectedMethods,
      language, setLanguage,
      topic, setTopic,
      results, setResults,
      loading, error, setError,
      activeMethod, setActiveMethod,
      generate,
    }}>
      {children}
    </StudyContext.Provider>
  );
}

export function useStudy() {
  const ctx = useContext(StudyContext);
  if (!ctx) throw new Error('useStudy must be used within StudyProvider');
  return ctx;
}
