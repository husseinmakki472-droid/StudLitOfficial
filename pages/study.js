import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useStudy } from '../context/StudyContext';
import StudyWorkspace from '../components/StudyWorkspace';

export default function StudyPage({ theme, toggleTheme }) {
  const router = useRouter();
  const { results, loading, error, selectedMethods } = useStudy();

  // Redirect back if no methods were selected
  useEffect(() => {
    if (!loading && !results && !error && !selectedMethods.length) {
      router.replace('/upload');
    }
  }, [loading, results, error, selectedMethods, router]);

  return (
    <StudyWorkspace theme={theme} toggleTheme={toggleTheme} />
  );
}
