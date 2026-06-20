import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export function generateEhrPdf(ehr, patientId) {
  console.log('Generating PDF for:', patientId, ehr);
  
  if (!ehr) {
    console.error('No EHR data provided to PDF generator');
    return
  }

  try {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()

    // ── Header ──────────────────────────────────────────────────────────────────
    doc.setFontSize(22)
    doc.setTextColor(20, 184, 166) // Teal-600 color
    doc.text('ELECTRONIC HEALTH RECORD', 14, 22)
    
    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139) // Slate-500
    doc.text(`Patient ID: ${patientId}`, 14, 30)
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, pageWidth - 14, 30, { align: 'right' })

    doc.setDrawColor(226, 232, 240) // Slate-200
    doc.line(14, 35, pageWidth - 14, 35)

    let y = 45

    // ── Section 1: Personal Details ───────────────────────────────────────────
    doc.setFontSize(14)
    doc.setTextColor(30, 41, 59) // Slate-800
    doc.text('Personal Details', 14, y)
    y += 6

    const personalData = [
      ['Name', ehr.demographics?.name || '—', 'DOB', ehr.demographics?.dob || '—'],
      ['Age', ehr.demographics?.age || '—', 'Gender', ehr.demographics?.gender || '—'],
      ['Blood Group', ehr.demographics?.bloodGroup || '—', 'Contact', ehr.demographics?.contact || '—'],
      ['Address', ehr.demographics?.address || '—', '', '']
    ]

    autoTable(doc, {
      startY: y,
      head: [],
      body: personalData,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: [100, 116, 139], cellWidth: 30 },
        1: { cellWidth: 60 },
        2: { fontStyle: 'bold', textColor: [100, 116, 139], cellWidth: 30 },
        3: { cellWidth: 60 }
      }
    })
    y = doc.lastAutoTable.finalY + 10

    // ── Section 2: Emergency Contact ──────────────────────────────────────────
    doc.setFontSize(14)
    doc.setTextColor(30, 41, 59)
    doc.text('Emergency Contact', 14, y)
    y += 6

    const emergencyData = [
      ['Name', ehr.emergencyContact?.name || '—'],
      ['Relation', ehr.emergencyContact?.relation || '—'],
      ['Phone', ehr.emergencyContact?.phone || '—']
    ]

    autoTable(doc, {
      startY: y,
      body: emergencyData,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: [100, 116, 139], cellWidth: 30 },
        1: { cellWidth: 150 }
      }
    })
    y = doc.lastAutoTable.finalY + 10

    // ── Section 3: Clinical Sections ──────────────────────────────────────────
    
    const addClinicalSection = (title, items, renderFn) => {
      try {
        if (y > 240) { doc.addPage(); y = 20 }
        doc.setFontSize(14)
        doc.setTextColor(30, 41, 59)
        doc.text(title, 14, y)
        y += 6

        if (!items || !Array.isArray(items) || items.length === 0) {
          doc.setFontSize(10)
          doc.setTextColor(148, 163, 184)
          doc.text('None recorded', 14, y)
          y += 8
        } else {
          const rows = items.map(item => {
            try {
              return [renderFn(item)]
            } catch (e) {
              console.warn(`Error rendering item in section ${title}:`, item, e);
              return ['[Entry Error]'];
            }
          })
          
          autoTable(doc, {
            startY: y,
            body: rows,
            theme: 'striped',
            styles: { fontSize: 10, cellPadding: 3 },
            headStyles: { fillColor: [248, 250, 252], textColor: [71, 85, 105], fontStyle: 'bold' },
          })
          y = doc.lastAutoTable.finalY + 10
        }
      } catch (e) {
        console.error(`Detailed error in addClinicalSection for ${title}:`, e);
      }
    }

    addClinicalSection('Allergies', ehr.allergies, a => 
      typeof a === 'string' ? a : `${a.substance || 'Unknown'} — ${a.reaction || 'No reaction'} (${a.severity || 'Unknown'})`
    )

    addClinicalSection('Chronic Conditions', ehr.chronicConditions, c => 
      typeof c === 'string' ? c : `${c.condition || 'Unknown'} (${c.status || 'Active'})`
    )

    addClinicalSection('Ongoing Medications', ehr.ongoingMedications, m => 
      typeof m === 'string' ? m : `${m.name || 'Unknown'} ${m.dose || ''} — ${m.frequency || ''}`
    )

    addClinicalSection('Immunizations', ehr.immunizations, i => {
      if (typeof i === 'string') return i;
      const d = (i && i.date) ? new Date(i.date) : null;
      const dateStr = (d && !isNaN(d.getTime())) ? d.toLocaleDateString('en-IN') : 'Unknown Date';
      return `${(i && i.vaccine) || 'Unknown Vaccine'} (${dateStr})`;
    })

    // ── Footer ──────────────────────────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(148, 163, 184)
      doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' })
      doc.text('This is a computer-generated health record secured by Blockchain.', 14, doc.internal.pageSize.getHeight() - 10)
    }

    console.log('Attempting to save PDF...');
    doc.save(`Health_Record_${patientId}.pdf`)
    console.log('PDF save command executed.');
  } catch (error) {
    console.error('CRITICAL ERROR generating PDF:', error);
    alert(`Failed to generate PDF: ${error.message}. Please check the console for details.`);
  }
}
