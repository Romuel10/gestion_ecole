import React from 'react';
import {
  FileText,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react';
import {
  EnrollmentFormField,
  EnrollmentQueueItem,
} from '../../services/cloudSync';
import { Modal } from '../common/Modal';

interface EnrollmentApplicationDetailModalProps {
  application: EnrollmentQueueItem | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenDocument: (documentId: string) => void;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const legacyField = (
  scope: EnrollmentFormField['scope'],
  group: EnrollmentFormField['group'],
  key: string,
  label: string,
  order: number,
  type: EnrollmentFormField['type'] = 'TEXT'
): EnrollmentFormField => ({
  scope,
  group,
  key,
  label,
  order,
  type,
  visible: true,
  required: false,
});

const legacyFamilyFields: EnrollmentFormField[] = [
  legacyField('FAMILY', 'PRIMARY', 'guardianLastName', 'Nom', 10),
  legacyField('FAMILY', 'PRIMARY', 'guardianFirstName', 'Prénoms', 20),
  legacyField('FAMILY', 'PRIMARY', 'relationship', 'Lien avec l’enfant', 30),
  legacyField('FAMILY', 'PRIMARY', 'phonePrimary', 'Téléphone principal', 40, 'PHONE'),
  legacyField('FAMILY', 'PRIMARY', 'phoneSecondary', 'Deuxième téléphone', 50, 'PHONE'),
  legacyField('FAMILY', 'PRIMARY', 'email', 'Email', 60, 'EMAIL'),
  legacyField('FAMILY', 'PRIMARY', 'cinNumber', 'N° CIN', 70),
  legacyField('FAMILY', 'PRIMARY', 'cinIssuedAt', 'Date de délivrance CIN', 80, 'DATE'),
  legacyField('FAMILY', 'PRIMARY', 'cinIssuePlace', 'Lieu de délivrance CIN', 90),
  legacyField('FAMILY', 'PRIMARY', 'occupation', 'Profession', 100),
  legacyField('FAMILY', 'PRIMARY', 'address', 'Adresse', 110),
  legacyField('FAMILY', 'PRIMARY', 'city', 'Ville / Commune', 120),
  legacyField('FAMILY', 'PRIMARY', 'preferredContact', 'Contact préféré', 130, 'SELECT'),
  legacyField('FAMILY', 'SECONDARY', 'secondaryRelationship', 'Lien avec l’enfant', 210),
  legacyField('FAMILY', 'SECONDARY', 'secondaryLastName', 'Nom', 220),
  legacyField('FAMILY', 'SECONDARY', 'secondaryFirstName', 'Prénoms', 230),
  legacyField('FAMILY', 'SECONDARY', 'secondaryPhonePrimary', 'Téléphone', 240, 'PHONE'),
  legacyField('FAMILY', 'SECONDARY', 'secondaryEmail', 'Email', 250, 'EMAIL'),
  legacyField('FAMILY', 'SECONDARY', 'secondaryCinNumber', 'N° CIN', 260),
  legacyField('FAMILY', 'SECONDARY', 'secondaryCinIssuedAt', 'Date CIN', 270, 'DATE'),
  legacyField('FAMILY', 'SECONDARY', 'secondaryCinIssuePlace', 'Lieu CIN', 280),
  legacyField('FAMILY', 'SECONDARY', 'secondaryOccupation', 'Profession', 290),
];

const legacyChildFields: EnrollmentFormField[] = [
  legacyField('CHILD', 'CHILD', 'type', 'Type de demande', 10, 'SELECT'),
  legacyField('CHILD', 'CHILD', 'existingMatricule', 'Matricule actuel', 20),
  legacyField('CHILD', 'CHILD', 'lastName', 'Nom', 30),
  legacyField('CHILD', 'CHILD', 'firstName', 'Prénoms', 40),
  legacyField('CHILD', 'CHILD', 'gender', 'Sexe', 50, 'SELECT'),
  legacyField('CHILD', 'CHILD', 'birthDate', 'Date de naissance', 60, 'DATE'),
  legacyField('CHILD', 'CHILD', 'birthPlace', 'Lieu de naissance', 70),
  legacyField('CHILD', 'CHILD', 'nationality', 'Nationalité', 80),
  legacyField('CHILD', 'CHILD', 'desiredClassId', 'Classe souhaitée', 90, 'CLASS'),
  legacyField('CHILD', 'CHILD', 'previousSchool', 'Ancien établissement', 100),
  legacyField('CHILD', 'CHILD', 'birthCertificateNumber', 'N° acte de naissance', 110),
  legacyField('CHILD', 'CHILD', 'birthCertificateDate', 'Date de l’acte', 120, 'DATE'),
  legacyField('CHILD', 'CHILD', 'birthCertificatePlace', 'Lieu de l’acte', 130),
  legacyField('CHILD', 'CHILD', 'bloodType', 'Groupe sanguin', 140),
  legacyField('CHILD', 'CHILD', 'address', 'Adresse', 150),
  legacyField('CHILD', 'CHILD', 'neighborhood', 'Fokontany / quartier', 160),
  legacyField('CHILD', 'CHILD', 'city', 'Ville / Commune', 170),
  legacyField('CHILD', 'CHILD', 'medicalNotes', 'Informations utiles / médicales', 180, 'TEXTAREA'),
];

const relationshipLabel: Record<string, string> = {
  FATHER: 'Père',
  MOTHER: 'Mère',
  GUARDIAN: 'Tuteur / responsable légal',
  OTHER: 'Autre',
};

const preferredContactLabel: Record<string, string> = {
  PHONE: 'Appel',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  EMAIL: 'Email',
};

const hasValue = (value: unknown) =>
  value !== null && value !== undefined && value !== '';

const valueLabel = (field: EnrollmentFormField, value: unknown) => {
  if (!hasValue(value)) return 'Non renseigné';
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (Array.isArray(value)) return value.map(String).join(', ');

  const normalized = String(value);
  if (
    field.key === 'relationship' ||
    field.key === 'secondaryRelationship'
  ) {
    return relationshipLabel[normalized] || normalized;
  }
  if (field.key === 'type') {
    return normalized === 'RE_REGISTRATION'
      ? 'Réinscription'
      : normalized === 'NEW'
        ? 'Nouvelle inscription'
        : normalized;
  }
  if (field.key === 'gender') {
    return normalized === 'M'
      ? 'Masculin'
      : normalized === 'F'
        ? 'Féminin'
        : normalized;
  }
  if (field.key === 'preferredContact') {
    return preferredContactLabel[normalized] || normalized;
  }
  return normalized;
};

const FieldGrid: React.FC<{
  fields: EnrollmentFormField[];
  valueFor: (field: EnrollmentFormField) => unknown;
}> = ({ fields, valueFor }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
    {fields.map((field) => (
      <div
        key={`${field.scope}:${field.key}`}
        className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="text-[9px] uppercase tracking-wide font-bold text-slate-400">
            {field.label}
          </div>
          <span className="shrink-0 text-[8px] font-semibold text-slate-400">
            {field.required ? 'Obligatoire' : 'Facultatif'}
          </span>
        </div>
        <div className="mt-1 text-xs font-medium break-words whitespace-pre-wrap">
          {valueLabel(field, valueFor(field))}
        </div>
        {field.helpText && (
          <div className="mt-1 text-[9px] text-slate-400">{field.helpText}</div>
        )}
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

  const familySubmission = asRecord(application.family?.submitted_payload);
  const submittedGuardian = asRecord(familySubmission.guardian);
  const guardian: Record<string, unknown> = Object.keys(submittedGuardian).length
    ? submittedGuardian
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

  const secondary = asRecord(guardian.secondary);
  const submittedChild = asRecord(application.submitted_payload?.child);
  const child: Record<string, unknown> = Object.keys(submittedChild).length
    ? submittedChild
    : {
        type: application.application_type,
        existingMatricule: application.existing_matricule,
        lastName: application.child_last_name,
        firstName: application.child_first_name,
        gender: application.child_gender,
        birthDate: application.child_birth_date,
        birthPlace: application.child_birth_place,
        nationality: application.child_nationality,
        desiredClassId:
          application.desiredClassName || application.desired_class_id,
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

  const schema =
    application.form_schema_snapshot ||
    application.family?.form_schema_snapshot ||
    null;
  const schemaFields =
    schema && Array.isArray(schema.fields) && schema.fields.length
      ? schema.fields
          .filter((field) => field.visible !== false)
          .sort((a, b) => a.order - b.order)
      : null;

  const familyFields = schemaFields
    ? schemaFields.filter((field) => field.scope === 'FAMILY')
    : legacyFamilyFields;
  const childFields = schemaFields
    ? schemaFields.filter((field) => field.scope === 'CHILD')
    : legacyChildFields;

  const primaryFields = familyFields.filter(
    (field) => field.group === 'PRIMARY' && !field.custom
  );
  const secondaryFields = familyFields.filter(
    (field) => field.group === 'SECONDARY' && !field.custom
  );
  const familyCustomFields = familyFields.filter((field) => field.custom);
  const childStandardFields = childFields.filter((field) => !field.custom);
  const childCustomFields = childFields.filter((field) => field.custom);

  const familyCustomAnswers = application.family?.custom_answers ?? {};
  const childCustomAnswers = application.custom_answers ?? {};

  const familyValue = (field: EnrollmentFormField) => {
    if (field.custom) return familyCustomAnswers[field.key];

    const map: Record<string, unknown> = {
      guardianLastName: guardian.lastName,
      guardianFirstName: guardian.firstName,
      relationship: guardian.relationship,
      phonePrimary: guardian.phonePrimary,
      phoneSecondary: guardian.phoneSecondary,
      email: guardian.email,
      cinNumber: guardian.cinNumber,
      cinIssuedAt: guardian.cinIssuedAt,
      cinIssuePlace: guardian.cinIssuePlace,
      occupation: guardian.occupation,
      address: guardian.address,
      city: guardian.city,
      preferredContact: guardian.preferredContact,
      secondaryRelationship: secondary.relationship,
      secondaryLastName: secondary.lastName,
      secondaryFirstName: secondary.firstName,
      secondaryPhonePrimary: secondary.phonePrimary,
      secondaryEmail: secondary.email,
      secondaryCinNumber: secondary.cinNumber,
      secondaryCinIssuedAt: secondary.cinIssuedAt,
      secondaryCinIssuePlace: secondary.cinIssuePlace,
      secondaryOccupation: secondary.occupation,
    };
    return map[field.key];
  };

  const childValue = (field: EnrollmentFormField) => {
    if (field.custom) return childCustomAnswers[field.key];
    if (field.key === 'desiredClassId') {
      return application.desiredClassName || child.desiredClassId;
    }
    return child[field.key];
  };

  const hasSecondary = secondaryFields.some((field) =>
    hasValue(familyValue(field))
  );

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
          Formulaire version{' '}
          {application.form_schema_version ||
            application.family?.form_schema_version ||
            '—'}
        </span>
        <span className="text-[10px] text-slate-400">
          Affichage basé sur la version exacte du formulaire remplie par la famille.
        </span>
      </div>

      {primaryFields.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <UserRound className="w-4 h-4 text-blue-600" />
            <h4 className="text-xs font-bold m-0">Responsable principal</h4>
          </div>
          <FieldGrid fields={primaryFields} valueFor={familyValue} />
        </section>
      )}

      {hasSecondary && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <UsersRound className="w-4 h-4 text-violet-600" />
            <h4 className="text-xs font-bold m-0">Deuxième responsable</h4>
          </div>
          <FieldGrid fields={secondaryFields} valueFor={familyValue} />
        </section>
      )}

      {familyCustomFields.length > 0 && (
        <section className="space-y-3">
          <div>
            <h4 className="text-xs font-bold m-0">
              Informations complémentaires — famille
            </h4>
            <p className="mt-1 text-[10px] text-slate-500">
              Champs ajoutés par l’établissement dans cette version du formulaire.
            </p>
          </div>
          <FieldGrid fields={familyCustomFields} valueFor={familyValue} />
        </section>
      )}

      {childStandardFields.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <UserRound className="w-4 h-4 text-emerald-600" />
            <h4 className="text-xs font-bold m-0">Enfant</h4>
          </div>
          <FieldGrid fields={childStandardFields} valueFor={childValue} />
        </section>
      )}

      {childCustomFields.length > 0 && (
        <section className="space-y-3">
          <div>
            <h4 className="text-xs font-bold m-0">
              Informations complémentaires — enfant
            </h4>
            <p className="mt-1 text-[10px] text-slate-500">
              Champs ajoutés par l’établissement dans cette version du formulaire.
            </p>
          </div>
          <FieldGrid fields={childCustomFields} valueFor={childValue} />
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
                      {document.document_type} ·{' '}
                      {Math.max(1, Math.round(document.file_size / 1024))} Ko
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
