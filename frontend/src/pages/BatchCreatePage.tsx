import React, { useState } from 'react';
import { useBatch } from '../context/BatchContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, Building2, MapPin, BookOpen, AlertCircle } from 'lucide-react';

export const BatchCreatePage: React.FC = () => {
  const { createBatch } = useBatch();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [courseName, setCourseName] = useState('Solar PV Technician & Rooftop Installer');
  const district = currentUser.district || 'Bhopal';
  const trainingCentre = currentUser.trainingCentre || 'Apex Skilling Hub - Bhopal';
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const COURSES = [
    'Solar PV Technician & Rooftop Installer',
    'Healthcare General Duty Assistant (GDA)',
    'CNC Milling & Precision Machining Operator',
    'Electric Vehicle (EV) Powertrain Maintenance',
    'Data Analytics & Office Automation',
    'Drone Surveying & Mapping Specialist',
  ];

  const DISTRICTS = ['Bhopal', 'Indore', 'Gwalior', 'Jabalpur', 'Ujjain'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseName.trim()) {
      setError('Course name is mandatory');
      return;
    }

    setIsCreating(true);
    setError(null);
    try {
      const newBatch = await createBatch(
        {
          courseName,
          district,
          trainingCentre,
        },
        currentUser
      );

      navigate(`/upload?batchId=${newBatch.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create batch.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      
      {/* Page Header */}
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <PlusCircle className="w-6 h-6 text-emerald-400" />
          Create New Training Batch
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Step 1 of 2: Define course parameters and training centre assignment.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-6 shadow-sm">
        
        {/* Course Selection */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-emerald-400" />
            Approved NSQF Course
          </label>
          <select
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          >
            {COURSES.map((course) => (
              <option key={course} value={course}>
                {course}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500">
            Course curriculum registered under the State Skilling Development Mission.
          </p>
        </div>

        {/* District Selection */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-sky-400" />
            District Jurisdiction
          </label>
          <select
            value={district}
            disabled
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          >
            {DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d} District
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500">
            Designated district officers will receive this batch for review.
          </p>
        </div>

        {/* Training Centre Info (Read-only for Anika) */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-purple-400" />
            Assigned Training Centre
          </label>
          <input
            type="text"
            value={trainingCentre}
            readOnly
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            placeholder="Training Centre Name"
          />
        </div>

        {/* Workflow Info Note */}
        <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/60 text-xs text-slate-400 space-y-1">
          <span className="font-semibold text-slate-200">What happens next?</span>
          <p>
            After creating the batch draft, you will upload the candidate roster CSV. Batches with more than 50 candidates are automatically routed to the State Quality Assurance Team for scrutiny.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isCreating}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-2 shadow-sm"
          >
            <span>{isCreating ? 'Creating Batch...' : 'Save & Proceed to Upload Roster'}</span>
            <PlusCircle className="w-4 h-4" />
          </button>
        </div>

      </form>
    </div>
  );
};
