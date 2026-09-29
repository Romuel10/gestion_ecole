import React from 'react';
import {
  FileText,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { EnrollmentQueueItem } from '../../services/cloudSync';
import { Modal } from '../common/Modal';

interface EnrollmentApplicationDetailModalProps {
  application: EnrollmentQueueItem | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenDocument: (documentId: string) => void;
}

const familyLabels: Record<string, string> = {
  lastName: 'Nom',
  firstName: 'Prénoms',
  relationship: 'Lien avec l’enfant',
  phonePrimary: 'Téléphone principal',
  phoneSecondary: 'Deuxième téléphone',
  email: 'Email',
  cinNumber: 'N° CIN',
  cinIssuedAt: 'Date de délivrance CIN',
  cinIssuePlace: 'Lieu de délivrance CIN',
  occupation: 'Profession',
  address: 'Adresse',
  city: 'Ville / Commune',
  preferredContact: 'Contact préféré',
};

const childLabels: Record<string, string> = {
  type: 'Type de demande',
  existingMatricule: 'Matricule actuel',
  lastName: 'Nom',
  firstName: 'Prénoms',
  gender: 'Sexe',
  birthDate: 'Date de naissance',
  birthPlace: 'Lieu de naissance',
  nationality: 'Nationalité',
  desiredClassId: 'Classe souhaitée',
  previousSchool: 'Ancien établissement',
  birthCertificateNumber: 'N° acte de naissance',
  birthCertificateDate: 'Date de l’acte',
  birthCertificatePlace: 'Lieu de l’acte',
  bloodType: 'Groupe sanguin',
  address: 'Adresse',
  neighborhood: 'Fokontany / quartier',
  city: 'Ville / Commune',
  medicalNotes: 'Informations utiles / médicales',
};

const relationshipLabel: Record<string, string> = {
  FATHER: 'Père',
  MOTHER: 'Mère',
  GUARDIAN: 'Tuteur / responsable légal',
  OTHER: 'Autre',
};

const valueLabel = (key: string, value: unknown) => {
  if (value === null || value === undefined || value === '') return 'Non renseigné';
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (key === 'relationship' && relationshipLabel[String(value)]) {
    return relationshipLabel[String(value)];
  }
  if (key === 'type') {
    return value === 'RE_REGISTRATION' ? 'Réinscription' : 'Nouvelle inscription';
  }
  if (key === 'gender') {
    return value === 'M' ? 'Masculin' : value === 'F' ? 'Féminin' : String(value);
  }
  return String(value);
};

const InfoGrid: React.FC<{
  data: Record<string, unknown>;
  labels: Record<string, string>;
}> = ({ data, labels }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
    {Object.entries(labels).map(([key, label]) => (
      <div
        key={key}
        className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700"
      >
        <div className="text-[9px] uppercase tracking-wide font-bold text-slate-400">
          {label}
        </div>
        <div className="mt-1 text-xs font-medium break-words">
          {valueLabel(key, data[key])}
        </div>
      </div>
    ))}
  </div>
);

export const EnrollmentApplicationDetailModal: React.FC<EnrollmentApplicationDetailModalProps> = ({
  application,
  isOpen,
  onClose,
  onOpenDocument,
}) => {
  if (!application) return null;

  const familyPayload =
    application.family?.submitted_payload &&
    typeof application.family.submitted_payload === 'object'
      ? application.family.submitted_payload
      : {};
  const guardian =
    familyPayload.guardian &&
    typeof familyPayload.guardian === 'object'
      ? (familyPayload.guardian as Record<string, unknown>)
      : {
          lastName: application.family?.guardian_last_name,
          firstName: application.family?.guardian_first_name,
          relationship: application.family?.relationship,
          phonePrimary: application.family?.phone_primary,
          phoneSecondary: application.family?.phone_secondary,
          email: application.family?.email,
          cinNumber: application.family?.cin_number,
          cinIssuedAt: application.family?.cin_issued_at,
          cinIssuePlace: application.family?.cin_issue_place,
          occupation: application.family?.occupation,
          address: application.family?.address,
          city: application.family?.city,
          preferredContact: application.family?.preferred_contact,
        };

  const secondary =
    guardian.secondary && typeof guardian.secondary === 'object'
      ? (guardian.secondary as Record<string, unknown>)
      : {};

  const childPayload =
    application.submitted_payload?.child &&
    typeof application.submitted_payload.child === 'object'
      ? (application.submitted_payload.child as Record<string, unknown>)
      : {
          type: application.application_type,
          existingMatricule: application.existing_matricule,
          lastName: application.child_last_name,
          firstName: application.child_first_name,
          gender: application.child_gender,
          birthDate: application.child_birth_date,
          birthPlace: application.child_birth_place,
          nationality: application.child_nationality,
          desiredClassId: application.desiredClassName || application.desired_class_id,
          previousSchool: application.previous_school,
          birthCertificateNumber: application.birth_certificate_number,
          birthCertificateDate: application.birth_certificate_date,
          birthCertificatePlace: application.birth_certificate_place,
          bloodType: application.blood_type,
          address: application.child_address,
          neighborhood: application.child_neighborhood,
          city: application.child_city,
          medicalNotes: application.medical_notes,
        };

  if (application.desiredClassName) {
    childPayload.desiredClassId = application.desiredClassName;
  }

  const schema =
    application.form_schema_snapshot ||
    application.family?.form_schema_snapshot ||
    null;
  const customFamily = application.family?.custom_answers ?? {};
  const customChild = application.custom_answers ?? {};
  const fieldLabel = (scope: 'FAMILY' | 'CHILD', key: string) =>
    schema?.fields.find((field) => field.scope === scope && field.key === key)?.label ||
    key;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Vérifier la demande reçue"
      subtitle={`${application.child_last_name} ${application.child_first_name} · ${application.familyProfileCode || application.family?.reference_code || 'Sans référence'}`}
      maxWidth="5xl"
      actions={
        <button type="button" className="button button--secondary" onClick={onClose}>
          Fermer
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Formulaire version {application.form_schema_version || application.family?.form_schema_version || '—'}
        </span>
        <span className="text-[10px] text-slate-400">
          Les informations ci-dessous correspondent au dossier transmis par la famille.
        </span>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <UserRound className="w-4 h-4 text-blue-600" />
          <h4 className="text-xs font-bold m-0">Responsable principal</h4>
        </div>
        <InfoGrid data={guardian} labels={familyLabels} />
      </section>

      {Object.values(secondary).some(
        (value) => value !== null && value !== undefined && value !== ''
      ) && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <UsersRound className="w-4 h-4 text-violet-600" />
            <h4 className="text-xs font-bold m-0">Deuxième responsable</h4>
          </div>
          <InfoGrid
            data={secondary}
            labels={{
              relationship: 'Lien avec l’enfant',
              lastName: 'Nom',
              firstName: 'Prénoms',
              phonePrimary: 'Téléphone',
              email: 'Email',
              cinNumber: 'N° CIN',
              cinIssuedAt: 'Date CIN',
              cinIssuePlace: 'Lieu CIN',
              occupation: 'Profession',
            }}
          />
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <UserRound className="w-4 h-4 text-emerald-600" />
          <h4 className="text-xs font-bold m-0">Enfant</h4>
        </div>
        <InfoGrid data={childPayload} labels={childLabels} />
      </section>

      {(Object.keys(customFamily).length > 0 || Object.keys(customChild).length > 0) && (
        <section className="space-y-3">
          <div>
            <h4 className="text-xs font-bold m-0">Réponses complémentaires</h4>
            <p className="mt-1 text-[10px] text-slate-500">
              Champs ajoutés par l’établissement au formulaire standard.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Object.entries(customFamily).map(([key, value]) => (
              <div
                key={`family:${key}`}
                className="p-3 rounded-lg border border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/20"
              >
                <div className="text-[9px] uppercase font-bold text-violet-500">
                  Famille · {fieldLabel('FAMILY', key)}
                </div>
                <div className="mt-1 text-xs font-medium">{valueLabel(key, value)}</div>
              </div>
            ))}
            {Object.entries(customChild).map(([key, value]) => (
              <div
                key={`child:${key}`}
                className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20"
              >
                <div className="text-[9px] uppercase font-bold text-emerald-600">
                  Enfant · {fieldLabel('CHILD', key)}
                </div>
                <div className="mt-1 text-xs font-medium">{valueLabel(key, value)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <h4 className="text-xs font-bold m-0">Pièces et contrôle du dossier</h4>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold text-slate-500">
              Checklist
            </div>
            {application.checklist.length ? (
              application.checklist.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  <div>
                    <div className="text-xs font-medium">{item.label}</div>
                    <div className="text-[9px] text-slate-400">
                      {item.required ? 'Obligatoire' : 'Facultatif'}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold">{item.status}</span>
                </div>
              ))
            ) : (
              <div className="text-[10px] text-slate-400">Aucune checklist.</div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold text-slate-500">
              Documents transmis
            </div>
            {application.documents.length ? (
              application.documents.map((document) => (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => onOpenDocument(document.id)}
                  className="w-full flex items-center justify-between gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">
                      {document.original_name}
                    </div>
                    <div className="text-[9px] text-slate-400">
                      {document.document_type} · {Math.max(1, Math.round(document.file_size / 1024))} Ko
                    </div>
                  </div>
                  <FileText className="w-4 h-4 shrink-0" />
                </button>
              ))
            ) : (
              <div className="text-[10px] text-slate-400">
                Aucun document transmis.
              </div>
            )}
          </div>
        </div>
      </section>
    </Modal>
  );
};
