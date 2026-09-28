import React, { useCallback, useEffect, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  PhoneCall,
  QrCode,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  XCircle,
} from 'lucide-react';
import { DatabaseSchema } from '../../types/school';
import {
  CloudSyncService,
  EnrollmentCampaign,
  EnrollmentQueueItem,
} from '../../services/cloudSync';
import { Modal } from '../common/Modal';

interface OnlineEnrollmentPanelProps {
  db: DatabaseSchema;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onPrepare: (application: EnrollmentQueueItem) => void;
}

const statusLabel: Record<EnrollmentQueueItem['status'], string> = {
  SUBMITTED: 'Reçue',
  TO_CONTACT: 'À contacter',
  CONTACTED: 'Contacté',
  APPOINTMENT_SCHEDULED: 'Rendez-vous prévu',
  INCOMPLETE: 'Dossier incomplet',
  COMPLETE: 'Dossier complet',
  ACCEPTED: 'Accepté',
  PAYMENT_PENDING: 'Paiement attendu',
  APPROVED: 'Inscrit',
  REJECTED: 'Refusé',
  WITHDRAWN: 'Retiré',
};

export const OnlineEnrollmentPanel: React.FC<OnlineEnrollmentPanelProps> = ({
  db,
  onShowToast,
  onPrepare,
}) => {
  const [campaign, setCampaign] = useState<EnrollmentCampaign | null>(null);
  const [applications, setApplications] = useState<EnrollmentQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [appointmentApplication, setAppointmentApplication] =
    useState<EnrollmentQueueItem | null>(null);
  const [appointmentAt, setAppointmentAt] = useState('');
  const [appointmentNote, setAppointmentNote] = useState('');

  const load = useCallback(async () => {
    if (!CloudSyncService.isConnected() || !CloudSyncService.getSchoolId()) {
      setCampaign(null);
      setApplications([]);
      return;
    }

    setLoading(true);
    try {
      const [nextCampaign, nextApplications] = await Promise.all([
        CloudSyncService.getOpenEnrollmentCampaign(db),
        CloudSyncService.listEnrollmentApplications(),
      ]);
      setCampaign(nextCampaign);
      setApplications(nextApplications);
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : 'Impossible de charger les préinscriptions.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [db, onShowToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const createCampaign = async () => {
    setLoading(true);
    try {
      const next = await CloudSyncService.createEnrollmentCampaign(db);
      setCampaign(next);
      onShowToast('Campagne QR ouverte pour l’année scolaire active.', 'success');
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : 'Impossible d’ouvrir la campagne QR.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (
    application: EnrollmentQueueItem,
    status: EnrollmentQueueItem['status']
  ) => {
    try {
      await CloudSyncService.updateEnrollmentApplication(application.id, status);
      await load();
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : 'Mise à jour impossible.',
        'error'
      );
    }
  };

  const markContacted = async (application: EnrollmentQueueItem) => {
    try {
      await CloudSyncService.logEnrollmentContact(
        application.id,
        'CALL',
        'Famille contactée depuis la file des admissions.'
      );
      await CloudSyncService.updateEnrollmentApplication(
        application.id,
        'CONTACTED'
      );
      await load();
      onShowToast('Appel enregistré et dossier marqué comme contacté.', 'success');
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : 'Impossible d’enregistrer le contact.',
        'error'
      );
    }
  };

  const openDocument = async (documentId: string) => {
    try {
      const url = await CloudSyncService.getEnrollmentDocumentUrl(documentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : 'Document indisponible.',
        'error'
      );
    }
  };

  const verifyChecklist = async (
    application: EnrollmentQueueItem,
    checklistItem: EnrollmentQueueItem['checklist'][number]
  ) => {
    try {
      if (checklistItem.document_id) {
        await CloudSyncService.verifyEnrollmentDocument(
          checklistItem.document_id,
          'VERIFIED',
          'Pièce contrôlée et validée par l’établissement.'
        );
      }
      await CloudSyncService.updateEnrollmentChecklistItem(
        checklistItem.id,
        'VERIFIED',
        'Vérifié par l’établissement.'
      );
      const refreshed = await CloudSyncService.listEnrollmentApplications();
      setApplications(refreshed);
      const current = refreshed.find((item) => item.id === application.id);
      if (
        current &&
        current.checklist
          .filter((item) => item.required)
          .every((item) => item.status === 'VERIFIED')
      ) {
        await CloudSyncService.updateEnrollmentApplication(
          application.id,
          'COMPLETE'
        );
        await load();
      }
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : 'Vérification impossible.',
        'error'
      );
    }
  };

  const scheduleAppointment = async () => {
    if (!appointmentApplication || !appointmentAt) {
      onShowToast('Choisissez une date et une heure de rendez-vous.', 'error');
      return;
    }
    try {
      const iso = new Date(appointmentAt).toISOString();
      await CloudSyncService.logEnrollmentContact(
        appointmentApplication.id,
        'APPOINTMENT',
        appointmentNote,
        iso
      );
      await CloudSyncService.updateEnrollmentApplication(
        appointmentApplication.id,
        'APPOINTMENT_SCHEDULED',
        appointmentNote,
        { appointmentAt: iso }
      );
      setAppointmentApplication(null);
      setAppointmentAt('');
      setAppointmentNote('');
      await load();
      onShowToast('Rendez-vous enregistré dans le dossier.', 'success');
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : 'Rendez-vous impossible à enregistrer.',
        'error'
      );
    }
  };

  const prepare = async (application: EnrollmentQueueItem) => {
    try {
      if (['SUBMITTED', 'TO_CONTACT'].includes(application.status)) {
        await CloudSyncService.updateEnrollmentApplication(
          application.id,
          'CONTACTED'
        );
      }
    } catch {
      // Le dossier reste utilisable localement même si le statut Cloud tarde à changer.
    }
    onPrepare(application);
  };

  if (!CloudSyncService.isConnected() || !CloudSyncService.getSchoolId()) {
    return (
      <div className="page-panel p-6">
        <h3 className="text-sm font-bold">Préinscriptions QR</h3>
        <p className="mt-2 text-xs text-slate-500">
          Connectez d’abord Sekoly Admin au Cloud dans Paramètres → Cloud & mobile.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="page-panel p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold m-0">Préinscription par QR code</h3>
            </div>
            <p className="mt-2 text-xs text-slate-500 max-w-2xl">
              Le parent scanne le QR, saisit une seule fois ses coordonnées, puis ajoute
              un ou plusieurs enfants. Le dossier arrive ici en attente. L’établissement
              appelle la famille avant de préparer puis confirmer l’inscription.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="button button--secondary"
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>

        {!campaign ? (
          <div className="mt-5 p-5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
            <div className="text-sm font-semibold">Aucune campagne ouverte</div>
            <p className="mt-1 text-xs text-slate-500">
              Ouvrez une campagne pour générer le lien public et son QR code.
            </p>
            <button
              type="button"
              onClick={() => void createCampaign()}
              disabled={loading}
              className="button button--primary mt-4"
            >
              <QrCode className="w-3.5 h-3.5" />
              Activer les inscriptions QR
            </button>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-4 flex flex-col items-center">
              <img
                src={campaign.qrUrl}
                alt="QR code de préinscription Sekoly"
                className="w-[210px] h-[210px]"
              />
              <div className="mt-2 text-[10px] uppercase tracking-wide font-bold text-slate-500">
                À afficher à l’accueil
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-wide font-bold text-slate-500">
                  Campagne active
                </div>
                <div className="mt-1 text-base font-bold">{campaign.name}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] uppercase font-bold text-slate-500">
                  Lien public
                </div>
                <div className="mt-1 text-[11px] font-mono break-all">
                  {campaign.publicUrl}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => window.open(campaign.publicUrl, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Tester le formulaire
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(campaign.publicUrl);
                      onShowToast('Lien de préinscription copié.', 'success');
                    } catch {
                      onShowToast('Copie automatique impossible.', 'info');
                    }
                  }}
                >
                  Copier le lien
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={async () => {
                    try {
                      await CloudSyncService.closeEnrollmentCampaign(campaign.id);
                      setCampaign(null);
                      onShowToast('Campagne QR fermée. Le lien public est désormais inactif.', 'info');
                    } catch (error) {
                      onShowToast(
                        error instanceof Error ? error.message : 'Impossible de fermer la campagne.',
                        'error'
                      );
                    }
                  }}
                >
                  Fermer la campagne
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="page-panel overflow-hidden">
        <div className="page-panel__header">
          <div>
            <h3 className="page-panel__title">Demandes reçues</h3>
            <p className="page-panel__subtitle">
              {applications.filter((item) =>
                ['SUBMITTED', 'TO_CONTACT'].includes(item.status)
              ).length} dossier(s) à contacter · {applications.length} enfant(s) au total
            </p>
          </div>
          <UserRoundCheck className="w-4 h-4 text-slate-400" />
        </div>

        {applications.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Aucune demande reçue pour le moment.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="erp-table min-w-[980px]">
              <thead>
                <tr>
                  <th>Référence famille</th>
                  <th>Enfant</th>
                  <th>Type</th>
                  <th>Classe souhaitée</th>
                  <th>Responsable</th>
                  <th>Téléphone</th>
                  <th>Dossier</th>
                  <th>Statut</th>
                  <th className="text-right">Traitement</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="font-mono font-semibold">
                        {item.familyProfileCode || item.family?.reference_code || '—'}
                      </div>
                      {item.familyProfileCode && item.family?.reference_code && (
                        <div className="mt-0.5 text-[9px] text-slate-400 font-mono">
                          Demande {item.family.reference_code}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="font-semibold">
                        {item.child_last_name} {item.child_first_name}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {item.child_birth_date || 'Date naissance non fournie'}
                      </div>
                    </td>
                    <td>
                      {item.application_type === 'RE_REGISTRATION'
                        ? 'Réinscription'
                        : 'Nouvelle'}
                    </td>
                    <td>{item.desiredClassName || 'À déterminer'}</td>
                    <td>
                      {item.family
                        ? `${item.family.guardian_last_name} ${item.family.guardian_first_name}`
                        : '—'}
                    </td>
                    <td className="font-mono">{item.family?.phone_primary || '—'}</td>
                    <td>
                      <div className="space-y-1.5 min-w-[170px]">
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>
                            {item.checklist.filter((row) => row.required && row.status === 'VERIFIED').length}/
                            {item.checklist.filter((row) => row.required).length} pièce(s) obligatoire(s)
                          </span>
                        </div>
                        {item.documents.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.documents.slice(0, 3).map((document) => (
                              <button
                                key={document.id}
                                type="button"
                                className="px-1.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[9px] hover:bg-slate-50 dark:hover:bg-slate-800"
                                title={document.original_name}
                                onClick={() => void openDocument(document.id)}
                              >
                                <FileText className="inline w-3 h-3 mr-1" />
                                {document.status === 'VERIFIED' ? 'Vérifié' : 'Pièce'}
                              </button>
                            ))}
                          </div>
                        )}
                        {item.checklist
                          .filter((row) => row.required && row.status !== 'VERIFIED')
                          .slice(0, 2)
                          .map((row) => (
                            <button
                              key={row.id}
                              type="button"
                              onClick={() => void verifyChecklist(item, row)}
                              className="block text-left text-[9px] text-amber-700 dark:text-amber-300 hover:underline"
                              title="Marquer comme vérifié après contrôle"
                            >
                              • {row.label}
                            </button>
                          ))}
                      </div>
                    </td>
                    <td>
                      <span className={`cloud-enrollment-status cloud-enrollment-status--${item.status.toLowerCase()}`}>
                        {statusLabel[item.status]}
                      </span>
                      {item.appointment_at && (
                        <div className="mt-1 text-[9px] text-slate-500">
                          <CalendarClock className="inline w-3 h-3 mr-1" />
                          {new Date(item.appointment_at).toLocaleString('fr-FR')}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        {['SUBMITTED', 'TO_CONTACT'].includes(item.status) && (
                          <button
                            type="button"
                            className="button button--secondary"
                            onClick={() => void markContacted(item)}
                          >
                            <PhoneCall className="w-3.5 h-3.5" />
                            Appel fait
                          </button>
                        )}
                        {['CONTACTED', 'INCOMPLETE'].includes(item.status) && (
                          <button
                            type="button"
                            className="button button--secondary"
                            onClick={() => {
                              setAppointmentApplication(item);
                              setAppointmentAt('');
                              setAppointmentNote('');
                            }}
                          >
                            <CalendarClock className="w-3.5 h-3.5" />
                            Rendez-vous
                          </button>
                        )}
                        {item.status === 'CONTACTED' && (
                          <button
                            type="button"
                            className="button button--secondary"
                            onClick={() => void updateStatus(item, 'INCOMPLETE')}
                          >
                            Dossier incomplet
                          </button>
                        )}
                        {['CONTACTED', 'INCOMPLETE'].includes(item.status) &&
                          item.checklist
                            .filter((row) => row.required)
                            .every((row) => row.status === 'VERIFIED') && (
                            <button
                              type="button"
                              className="button button--secondary"
                              onClick={() => void updateStatus(item, 'COMPLETE')}
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              Dossier complet
                            </button>
                          )}
                        {item.status === 'COMPLETE' && (
                          <button
                            type="button"
                            className="button button--secondary"
                            onClick={() => void updateStatus(item, 'ACCEPTED')}
                          >
                            Accepté
                          </button>
                        )}
                        {item.status === 'ACCEPTED' && (
                          <button
                            type="button"
                            className="button button--secondary"
                            onClick={() =>
                              void CloudSyncService.updateEnrollmentApplication(
                                item.id,
                                'PAYMENT_PENDING',
                                undefined,
                                { paymentStatus: 'PENDING' }
                              ).then(load)
                            }
                          >
                            Paiement attendu
                          </button>
                        )}
                        {[
                          'CONTACTED',
                          'APPOINTMENT_SCHEDULED',
                          'INCOMPLETE',
                          'COMPLETE',
                          'ACCEPTED',
                          'PAYMENT_PENDING',
                        ].includes(item.status) && (
                          <button
                            type="button"
                            className="button button--primary"
                            onClick={() => void prepare(item)}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Préparer dossier
                          </button>
                        )}
                        {!['APPROVED', 'REJECTED'].includes(item.status) && (
                          <button
                            type="button"
                            className="icon-button"
                            title="Refuser la demande"
                            onClick={() => void updateStatus(item, 'REJECTED')}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        isOpen={Boolean(appointmentApplication)}
        onClose={() => setAppointmentApplication(null)}
        title="Planifier un rendez-vous"
        subtitle={
          appointmentApplication
            ? `${appointmentApplication.child_last_name} ${appointmentApplication.child_first_name} · ${appointmentApplication.family?.phone_primary || ''}`
            : undefined
        }
        maxWidth="md"
        actions={
          <>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => setAppointmentApplication(null)}
            >
              Annuler
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={() => void scheduleAppointment()}
            >
              Enregistrer le rendez-vous
            </button>
          </>
        }
      >
        <div>
          <label className="block text-[10px] uppercase font-bold tracking-wide text-slate-500 mb-1.5">
            Date et heure
          </label>
          <input
            type="datetime-local"
            value={appointmentAt}
            onChange={(event) => setAppointmentAt(event.target.value)}
            className="settings-input"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase font-bold tracking-wide text-slate-500 mb-1.5">
            Note pour le rendez-vous
          </label>
          <textarea
            value={appointmentNote}
            onChange={(event) => setAppointmentNote(event.target.value)}
            rows={4}
            placeholder="Pièces à apporter, personne à rencontrer, observations…"
            className="settings-input resize-y"
          />
        </div>
      </Modal>
    </div>
  );
};
