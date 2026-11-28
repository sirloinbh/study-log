import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';

import { StudyHistory } from './study-history';
import { StudyLogs } from './study-logs';

// The two pages that share a log (#478). Editing a log on the History page opens the Study log page
// with `?edit=<id>`; saving or cancelling the edit goes back to History.
const historyPath = '/history';

export function StudyLogPage({ today, onChange }: { today: string; onChange?: () => void }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const raw = params.get('edit');
  const editId = raw !== null && /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : undefined;
  return (
    <StudyLogs
      // A new key per edited log gives the form a clean start.
      key={editId ?? 'new'}
      today={today}
      onChange={onChange}
      editId={editId}
      onEditEnd={(saved) =>
        void navigate(historyPath, saved ? { state: { notice: saved } } : undefined)
      }
    />
  );
}

export function StudyHistoryPage({ today, onChange }: { today: string; onChange?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  // The notice is shown once: a reload of the page does not bring it back.
  useEffect(() => {
    if (notice) void navigate(location.pathname, { replace: true, state: null });
  }, [notice, location.pathname, navigate]);
  return (
    <StudyHistory
      today={today}
      notice={notice}
      onChange={onChange}
      onEdit={(id) => void navigate(`/?edit=${id}`)}
    />
  );
}
