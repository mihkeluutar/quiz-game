import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { toast } from 'sonner';
import { Loader2, Image as ImageIcon, X, Plus, Trash2 } from 'lucide-react';
import { Question } from '../types/quiz';
import { api } from '../utils/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

// Image compression helper (same as in Game.tsx)
const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxWidth = 1920;
                const maxHeight = 1080;
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > maxWidth) {
                        height = (height * maxWidth) / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = (width * maxHeight) / height;
                        height = maxHeight;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas context not available'));
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Compression failed'));
                        return;
                    }
                    const newFile = new File([blob], file.name, { type: 'image/jpeg' });
                    resolve(newFile);
                }, 'image/jpeg', 0.7);
            };
            img.onerror = (err) => {
                URL.revokeObjectURL(img.src);
                reject(err);
            };
            img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

interface HostBlockEditorProps {
  code: string;
  blockId: string | null;
  existingBlock?: { id: string; title: string };
  existingQuestions: Question[];
  onSave: () => void;
  onCancel: () => void;
}

export const HostBlockEditor: React.FC<HostBlockEditorProps> = ({
  code,
  blockId,
  existingBlock,
  existingQuestions,
  onSave,
  onCancel,
}) => {
  const [title, setTitle] = useState(existingBlock?.title || '');
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState<Partial<Question>[]>(
    existingQuestions.length > 0
      ? existingQuestions
      : [{ type: 'open', text: '', options: ['', ''], correct_answer: '' }]
  );
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [questionToDelete, setQuestionToDelete] = useState<number | null>(null);

  const updateQuestion = (idx: number, field: string, value: any) => {
    const newQs = [...questions];
    newQs[idx] = { ...newQs[idx], [field]: value };
    setQuestions(newQs);
  };

  const handleUpload = async (idx: number, file: File) => {
    try {
      setUploadingIdx(idx);
      toast.info("Compressing & Uploading...");
      
      let fileToUpload = file;
      if (file.type.startsWith('image/')) {
        try {
          fileToUpload = await compressImage(file);
        } catch (ce) {
          console.warn("Compression failed, trying original", ce);
        }
      }

      if (fileToUpload.size > 4.5 * 1024 * 1024) {
        throw new Error(`File is too large (${(fileToUpload.size / 1024 / 1024).toFixed(1)}MB). Please use a smaller image.`);
      }

      const url = await api.uploadImage(fileToUpload);
      updateQuestion(idx, 'image_url', url);
      toast.success("Image uploaded!");
    } catch (e: any) {
      console.error("Upload error detail:", e);
      let msg = e.message || "Unknown error";
      if (typeof e.message === 'object') msg = JSON.stringify(e.message);
      toast.error("Upload failed: " + msg);
    } finally {
      setUploadingIdx(null);
    }
  };

  const addQuestion = () => {
    setQuestions([...questions, { type: 'open', text: '', options: ['', ''], correct_answer: '' }]);
  };

  const handleRemoveClick = (idx: number) => {
    const question = questions[idx];
    const hasContent = question.text && question.text.trim() !== '';
    
    if (hasContent) {
      setQuestionToDelete(idx);
    } else {
      removeQuestion(idx);
    }
  };

  const removeQuestion = (idx: number) => {
    if (questions.length > 1) {
      const newQuestions = questions.filter((_, i) => i !== idx);
      setQuestions(newQuestions);
      setQuestionToDelete(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!title) throw new Error("Block title is required");
      
      const questionsWithText = questions.filter(q => q.text && q.text.trim() !== '');
      if (questionsWithText.length === 0) {
        throw new Error("You must create at least 1 question with text");
      }
      
      for (const q of questions) {
        if (q.text && q.text.trim() !== '') {
          if (q.type === 'mcq' && (!q.options || q.options.length < 2)) {
            throw new Error("MCQs need at least 2 options");
          }
          if (!q.correct_answer) {
            throw new Error("All questions need a correct answer");
          }
        }
      }

      await api.saveHostBlock(code, blockId, title, questions);
      toast.success("Block saved!");
      onSave();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-6 pb-20 bg-white rounded-lg border">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">{blockId ? 'Edit Host Block' : 'Create Host Block'}</h2>
      </div>
      
      <div className="space-y-2">
        <Label>Block Title</Label>
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Round 1: Warm-up" />
      </div>

      {questions.map((q: any, i: number) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Question {i + 1}</CardTitle>
            {questions.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveClick(i)}
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <Input 
              value={q.text} 
              onChange={e => updateQuestion(i, 'text', e.target.value)} 
              placeholder="Question text..." 
            />
            
            <div className="space-y-2">
              {q.image_url ? (
                <div className="relative group rounded-lg border overflow-hidden w-full h-40 bg-slate-50">
                  <img src={q.image_url} alt="Preview" className="w-full h-full object-contain" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button variant="secondary" size="sm" className="pointer-events-auto relative">
                      Change
                      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={(e) => e.target.files?.[0] && handleUpload(i, e.target.files[0])} />
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => updateQuestion(i, 'image_url', '')}>Remove</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Label className={`cursor-pointer bg-slate-100 p-2 rounded hover:bg-slate-200 flex items-center gap-2 text-xs border ${uploadingIdx === i ? 'opacity-50 pointer-events-none' : ''}`}>
                    {uploadingIdx === i ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                    {uploadingIdx === i ? 'Uploading...' : 'Add Image'}
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleUpload(i, e.target.files[0])} />
                  </Label>
                </div>
              )}
            </div>

            <RadioGroup 
              value={q.type} 
              onValueChange={val => updateQuestion(i, 'type', val)} 
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="open" id={`q${i}-open`} />
                <Label htmlFor={`q${i}-open`}>Open Answer</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="mcq" id={`q${i}-mcq`} />
                <Label htmlFor={`q${i}-mcq`}>Multiple Choice</Label>
              </div>
            </RadioGroup>

            {q.type === 'mcq' && (
              <div className="space-y-2 pl-4 border-l-2 border-slate-100">
                <Label>Options</Label>
                {(q.options || ['', '']).map((opt: string, optIdx: number) => {
                  const options = q.options || [''];
                  const canRemove = options.length > 2;
                  
                  return (
                    <div key={optIdx} className="flex gap-2 items-center">
                      <Input 
                        value={opt} 
                        onChange={e => {
                          const newOpts = [...options];
                          newOpts[optIdx] = e.target.value;
                          updateQuestion(i, 'options', newOpts);
                        }}
                        placeholder={`Option ${optIdx + 1}`}
                        className="h-8 text-sm flex-1"
                      />
                      <div className="flex items-center gap-2">
                        <input 
                          type="radio" 
                          name={`correct-${i}`}
                          checked={q.correct_answer === opt && opt !== ''}
                          onChange={() => updateQuestion(i, 'correct_answer', opt)}
                          className="w-4 h-4 text-green-600"
                        />
                        {canRemove && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const newOpts = options.filter((_, idx) => idx !== optIdx);
                              if (q.correct_answer === opt) {
                                updateQuestion(i, 'correct_answer', '');
                              }
                              updateQuestion(i, 'options', newOpts);
                            }}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => updateQuestion(i, 'options', [...(q.options || []), ''])}
                >+ Add Option</Button>
              </div>
            )}

            {q.type === 'open' && (
              <div className="space-y-2">
                <Label>Correct Answer (for host)</Label>
                <Input 
                  value={q.correct_answer} 
                  onChange={e => updateQuestion(i, 'correct_answer', e.target.value)} 
                  placeholder="Expected answer..." 
                />
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={addQuestion}
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Another Question
      </Button>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Block'}
        </Button>
      </div>

      <AlertDialog open={questionToDelete !== null} onOpenChange={(open) => !open && setQuestionToDelete(null)}>
        <AlertDialogContent className="max-w-md mx-4">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Question?</AlertDialogTitle>
            <AlertDialogDescription>
              This question has content. Are you sure you want to delete it? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => questionToDelete !== null && removeQuestion(questionToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

