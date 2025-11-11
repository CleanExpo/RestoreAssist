"use client";

import { useState, useEffect } from "react";

interface Question {
  id: number | null;
  question: string;
  category: string;
  expected_evidence?: string[];
  report_grade?: number;
  source?: string;
  ai_generated?: boolean;
}

interface Answer {
  question_id: number | null;
  question: string;
  answer: string;
  evidence_url?: string;
  verified: boolean;
}

interface QuestionReviewProps {
  reportId: string;
}

export default function QuestionReview({ reportId }: QuestionReviewProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<{ [key: string]: Answer }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadQuestions();
    loadExistingResponses();
  }, [reportId]);

  const loadQuestions = async () => {
    try {
      const response = await fetch(`/api/questions/generate?report=${reportId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load questions');
      }

      setQuestions(data.questions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  const loadExistingResponses = async () => {
    try {
      const response = await fetch(`/api/questions/${reportId}`);
      const data = await response.json();

      if (response.ok && data.responses) {
        const existingAnswers: { [key: string]: Answer } = {};
        data.responses.forEach((r: any) => {
          const key = r.question_id || r.question_text;
          existingAnswers[key] = {
            question_id: r.question_id,
            question: r.question_text || r.question_bank?.question,
            answer: r.answer || '',
            evidence_url: r.evidence_url || '',
            verified: r.verified || false
          };
        });
        setAnswers(existingAnswers);
      }
    } catch (err) {
      console.error('Failed to load existing responses:', err);
    }
  };

  const handleAnswerChange = (questionKey: string, field: keyof Answer, value: any) => {
    setAnswers(prev => ({
      ...prev,
      [questionKey]: {
        ...prev[questionKey],
        [field]: value
      }
    }));
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const answerArray = Object.entries(answers).map(([key, answer]) => ({
        question_id: answer.question_id,
        question_text: answer.question || key,
        answer: answer.answer,
        evidence_url: answer.evidence_url,
        verified: answer.verified
      }));

      const response = await fetch('/api/questions/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: reportId,
          answers: answerArray
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save responses');
      }

      setSuccessMessage(`Successfully saved ${data.count} responses (${data.verified_count} verified)`);

      // Reload to get updated data
      await loadExistingResponses();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save responses');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  const groupedQuestions = questions.reduce((acc, q) => {
    if (!acc[q.category]) acc[q.category] = [];
    acc[q.category].push(q);
    return acc;
  }, {} as { [category: string]: Question[] });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-2xl font-bold mb-4">Quality Assurance Checklist</h2>
        <p className="text-gray-600 mb-2">
          Report ID: {reportId}
        </p>
        <div className="flex gap-4 text-sm text-gray-500">
          <span>{questions.length} total questions</span>
          <span>•</span>
          <span>{questions.filter(q => q.ai_generated).length} AI-generated</span>
          <span>•</span>
          <span>{questions.filter(q => !q.ai_generated).length} from question bank</span>
        </div>
      </div>

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800">{successMessage}</p>
        </div>
      )}

      {Object.entries(groupedQuestions).map(([category, categoryQuestions]) => (
        <div key={category} className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-xl font-semibold mb-4 text-gray-800">{category}</h3>
          <div className="space-y-4">
            {categoryQuestions.map((q, idx) => {
              const questionKey = q.id?.toString() || q.question;
              const currentAnswer = answers[questionKey] || {
                question_id: q.id,
                question: q.question,
                answer: '',
                evidence_url: '',
                verified: false
              };

              return (
                <div key={idx} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{q.question}</p>
                      {q.expected_evidence && q.expected_evidence.length > 0 && (
                        <div className="mt-2">
                          <p className="text-sm text-gray-600 font-medium">Expected Evidence:</p>
                          <ul className="list-disc list-inside text-sm text-gray-500">
                            {q.expected_evidence.map((e, i) => (
                              <li key={i}>{e}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    {q.ai_generated && (
                      <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                        AI
                      </span>
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Answer / Notes
                      </label>
                      <textarea
                        className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        rows={2}
                        value={currentAnswer.answer}
                        onChange={(e) => handleAnswerChange(questionKey, 'answer', e.target.value)}
                        placeholder="Enter your answer or observations..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Evidence URL (Optional)
                      </label>
                      <input
                        type="url"
                        className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        value={currentAnswer.evidence_url || ''}
                        onChange={(e) => handleAnswerChange(questionKey, 'evidence_url', e.target.value)}
                        placeholder="https://... (link to photo, document, etc.)"
                      />
                    </div>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={currentAnswer.verified}
                        onChange={(e) => handleAnswerChange(questionKey, 'verified', e.target.checked)}
                      />
                      <span className="text-sm text-gray-700">Verified</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 flex justify-end gap-4">
        <button
          onClick={() => loadExistingResponses()}
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
          disabled={saving}
        >
          Reset
        </button>
        <button
          onClick={submit}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Responses'}
        </button>
      </div>
    </div>
  );
}
