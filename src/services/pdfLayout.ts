export type PdfLogoPosition = 'LEFT' | 'CENTER' | 'RIGHT';

export interface PdfLogoPlacement {
  position: PdfLogoPosition;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfInstitutionHeaderLayout {
  institutionNameY: number;
  regionalLineY: number;
  contactLineY: number;
  separatorY: number;
  documentTitleY: number;
  contentStartY: number;
  institutionMaxWidth: number;
}

export function computeInstitutionHeaderLayout(
  pageWidth: number,
  logo: PdfLogoPlacement | null
): PdfInstitutionHeaderLayout {
  const centeredLogo = logo?.position === 'CENTER';
  const institutionNameY = centeredLogo && logo ? logo.y + logo.height + 5 : 12;
  const regionalLineY = institutionNameY + 4.5;
  const contactLineY = institutionNameY + 8.5;
  const separatorY = contactLineY + 4.5;
  const documentTitleY = separatorY + 8;
  const contentStartY = documentTitleY + 5;
  const sideReserve = logo && logo.position !== 'CENTER' ? logo.width + 5 : 0;
  const institutionMaxWidth = Math.max(48, pageWidth - 28 - sideReserve * 2);

  return {
    institutionNameY,
    regionalLineY,
    contactLineY,
    separatorY,
    documentTitleY,
    contentStartY,
    institutionMaxWidth,
  };
}
