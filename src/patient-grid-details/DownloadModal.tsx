import React, { useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, RadioButtonGroup, RadioButton } from '@carbon/react';
import { DownloadGridData, useDownloadGridData } from '../api';
import { getPatientGridDownloadReportData, InlinePatientGridEditingContext } from '../grid-utils';
import xlsx from 'xlsx';

export interface DownloadModalProps {
  patientGridId: string;
  isOpen: boolean;
  onClose(): void;
  refreshGrid?(): void;
}

export function DownloadModal({ patientGridId, isOpen, onClose, refreshGrid }: DownloadModalProps) {
  const { t } = useTranslation();
  const [fileExtension, setFileExtension] = useState<string | undefined>(undefined);
  const [hasDownloadStarted, setHasDownloadStarted] = useState(false);
  const { saveChanges } = useContext(InlinePatientGridEditingContext);
  const handleDownloadPrepared = async ({
    download,
    patientGrid,
    forms,
    formSchemas,
    columnNamesToInclude,
    patientDetailsGroupHeader,
  }: Omit<DownloadGridData, 'fileName'>) => {
    const spreadsheetData = getPatientGridDownloadReportData(
      download,
      patientGrid,
      forms,
      formSchemas,
      columnNamesToInclude,
      patientDetailsGroupHeader,
    );
    //split data into different tabs
    const input: string[][] = spreadsheetData;
    // create a workbook object
    const wb = xlsx.utils.book_new();
    //logic to calculate column ranges
    const columnRange: Array<Array<number>> = [];
    let start = 0;
    let end = 1;
    for (let i = 1; i < input[0].length; i++) {
      if (input[0][i] === null || input[0][i] === '') {
        end++;
      } else {
        const rangeList: Array<number> = [];
        rangeList.push(start);
        rangeList.push(end - 1);
        start = end;
        end++;
        columnRange.push(rangeList);
      }
    }
    const lastrangeList: Array<number> = [];
    lastrangeList.push(start);
    lastrangeList.push(end);
    columnRange.push(lastrangeList);
    // loop over column ranges and create corresponding tabs
    let flag = true;
    for (let i = 0; i < columnRange.length; i++) {
      let ws: xlsx.WorkSheet = xlsx.utils.aoa_to_sheet([]);
      const [start, end] = columnRange[i];
      if (flag) {
        for (let i = 0; i < 4; i++) {
          const [start, end] = columnRange[i];
          const part = input.map((row) => row.slice(start, end + 1));
          ws = xlsx.utils.aoa_to_sheet(part);
        }
        flag = false;
      }
      const part = input.map((row) => row.slice(start, end + 1));
      ws = xlsx.utils.aoa_to_sheet(part);
      xlsx.utils.book_append_sheet(wb, ws, `Tab${i + 1}`);
    }
    xlsx.writeFile(wb, 'output.xlsx');
    onClose();
  };

  const saveHandler = async () => {
    await saveChanges().then(() => {
      refreshGrid();
    });
  };

  const modalPropsForSteps = {
    internalExternal: {
      danger: true,
      modalHeading: t('downloadModalInternalExternalHeading', 'Shared ICRC internally?'),
      modalBody: (
        <p>{t('downloadModalInternalExternalBody', 'Is the data extracted shared EXCLUSIVELY within the ICRC?')}</p>
      ),
      primaryButtonText: t('downloadModalInternalExternalSecondaryButtonText', 'No (external transfer)'),
      secondaryButtonText: t('downloadModalInternalExternalPrimaryButtonText', 'Yes (only ICRC internal)'),
      onRequestSubmit() {
        setStepKey('externalConfirmation');
      },
      onSecondarySubmit() {
        setStepKey('chooseDownload');
      },
    },

    externalConfirmation: {
      danger: false,
      modalHeading: t('downloadModalExternalConfirmationHeading', 'Please note'),
      modalBody: (
        <p>
          {t(
            'downloadModalExternalConfirmationBody',
            'Under the ICRC rules on data protection, you are required to minimize the amount of personal data that is to be transferred outside of ICRC. You must edit the spreadsheet to ensure data minimization before sharing.',
          )}
        </p>
      ),
      primaryButtonText: t('downloadModalExternalConfirmationPrimaryButtonText', 'Proceed'),
      secondaryButtonText: t('downloadModalExternalConfirmationSecondaryButtonText', 'Cancel'),
      onRequestSubmit() {
        setStepKey('chooseDownload');
      },
      onSecondarySubmit() {
        onClose();
      },
    },

    chooseDownload: {
      danger: false,
      modalHeading: t('downloadModalChooseDownloadHeading', 'Download data as file'),
      modalBody: hasDownloadStarted ? (
        <PrepareDownload patientGridId={patientGridId} onDownloadPrepared={handleDownloadPrepared} />
      ) : (
        <RadioButtonGroup
          legendText={t(
            'downloadModalChooseDownloadLegend',
            'Select the file format that you want the data to be converted to',
          )}
          name="file-extension-group"
          defaultSelected={fileExtension}
          orientation="vertical"
          onChange={(value) => setFileExtension(value)}>
          <RadioButton
            labelText={t('downloadModalChooseDownloadCsvOption', 'CSV (Comma-Separated Values)')}
            value="csv"
            id="csv"
          />
          <RadioButton
            labelText={t('downloadModalChooseDownloadXlsxOption', 'XLSX (Microsoft Excel)')}
            value="xlsx"
            id="xlsx"
          />
        </RadioButtonGroup>
      ),
      primaryButtonText: hasDownloadStarted
        ? t('downloadModalChooseDownloadPrimaryButtonTextDownloading', 'Converting...')
        : t('downloadModalChooseDownloadPrimaryButtonTextConvert', 'Convert & Download'),
      secondaryButtonText: t('downloadModalChooseDownloadSecondaryButtonTextCancel', 'Cancel'),
      onRequestSubmit() {
        saveHandler();
        setHasDownloadStarted(true);
      },
      onSecondarySubmit() {
        onClose();
      },
    },
  };
  const [stepKey, setStepKey] = useState<keyof typeof modalPropsForSteps>('internalExternal');
  const step = modalPropsForSteps[stepKey];

  useEffect(() => {
    // Reset to the first step whenever the modal is newly opened.
    if (isOpen) {
      setStepKey('internalExternal');
      setHasDownloadStarted(false);
      setFileExtension(undefined);
    }
  }, [isOpen]);

  return (
    <Modal
      open={isOpen}
      danger={step.danger}
      modalHeading={step.modalHeading}
      primaryButtonText={step.primaryButtonText}
      secondaryButtonText={step.secondaryButtonText}
      primaryButtonDisabled={hasDownloadStarted || (!fileExtension && stepKey === 'chooseDownload')}
      onRequestSubmit={() => step.onRequestSubmit()}
      onSecondarySubmit={() => step.onSecondarySubmit()}
      onRequestClose={onClose}>
      {step.modalBody}
    </Modal>
  );
}

interface PrepareDownloadProps {
  patientGridId: string;
  onDownloadPrepared(data: Omit<DownloadGridData, 'fileName'>): void;
}

function PrepareDownload({ patientGridId, onDownloadPrepared }: PrepareDownloadProps) {
  const { t } = useTranslation();
  const { data, error } = useDownloadGridData(patientGridId);
  const triggered = useRef(false);

  useEffect(() => {
    if (data && !triggered.current) {
      triggered.current = true;
      onDownloadPrepared(data);
    }
  }, [data, error, onDownloadPrepared]);

  return (
    <p>
      {error
        ? t(
            'downloadModalChooseDownloadError',
            'There was an error while preparing the download. You can close this modal and try again.',
          )
        : t(
            'downloadModalChooseDownloadDownloadingMessage',
            "Preparing your download... This may take some time. Please don't close or reload this browser window.",
          )}
    </p>
  );
}
