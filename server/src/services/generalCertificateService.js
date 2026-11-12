const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const pool = require('../config/db');

const TEMPLATES = [
 { match: /FINAL_CERTIFICATE|^FINAL$/, prefix:'FC', title:'FINAL CERTIFICATE', body:s=>`This is to certify that ${s.student_name}, bearing Roll No. ${s.roll_number} and Registration No. ${s.registration_number}, has completed the academic programme in ${s.department_name}, subject to official institutional records.` },
 { match: /PROVISIONAL/, prefix:'PC', title:'PROVISIONAL CERTIFICATE', body:s=>`This is to certify that ${s.student_name}, Roll No. ${s.roll_number}, Registration No. ${s.registration_number}, has provisionally completed the programme in ${s.department_name}, pending formal issuance of the final certificate.` },
 { match: /GRADE|MARKSHEET|MARK_SHEET/, prefix:'GS', title:'GRADE SHEET CERTIFICATE', body:s=>`This document certifies that the grade-sheet request for ${s.student_name} (Roll No. ${s.roll_number}, Registration No. ${s.registration_number}), Department of ${s.department_name}, has been approved. Official marks and grades must be taken from verified examination records and attached before formal issue.` },
 { match: /CONDUCT/, prefix:'CC', title:'CONDUCT CERTIFICATE', body:s=>`This is to certify that ${s.student_name}, Roll No. ${s.roll_number}, Registration No. ${s.registration_number}, was a student of the Department of ${s.department_name}. Conduct particulars are subject to official institutional records.` },
 { match: /COLLEGE_LEAVING|LEAVING_CERTIFICATE|^CLC$/, prefix:'CLC', title:'COLLEGE LEAVING CERTIFICATE', body:s=>`This is to certify that ${s.student_name}, Roll No. ${s.roll_number}, Registration No. ${s.registration_number}, of the Department of ${s.department_name}, has been granted a College Leaving Certificate following approval of the request. Admission and leaving particulars must be verified against the official college register.` },
 { match: /CAUTION/, prefix:'CM', title:'CAUTION MONEY REFUND / COMPLETION ACKNOWLEDGEMENT', body:s=>`This document acknowledges approval for processing the Caution Money request of ${s.student_name}, Roll No. ${s.roll_number}, Registration No. ${s.registration_number}, Department of ${s.department_name}. This is not proof of a bank refund; the Accounts Section must record the approved amount and refund transaction separately.` },
 { match: /NO_DUE|NODUE/, prefix:'NDC', title:'NO-DUE CERTIFICATE', body:s=>`This is to certify that the no-due request for ${s.student_name}, Roll No. ${s.roll_number}, Registration No. ${s.registration_number}, Department of ${s.department_name}, has been approved in the portal workflow, subject to the final college records.` },
];
const safeName = s => String(s).replace(/[^a-zA-Z0-9._-]/g, '-');

async function generateGeneralCertificate({ requestId, generatedBy = null }) {
 const connection = await pool.getConnection(); let filePath;
 try {
  await connection.beginTransaction();
  const [rows] = await connection.query(`SELECT r.id request_id,r.request_number,r.status request_status,dt.code document_code,dt.name document_name,s.roll_number,s.registration_number,u.name student_name,u.profile_photo_path,d.name department_name FROM requests r JOIN document_types dt ON dt.id=r.document_type_id JOIN students s ON s.id=r.student_id JOIN users u ON u.id=s.user_id LEFT JOIN departments d ON d.id=s.department_id WHERE r.id=? FOR UPDATE`, [requestId]);
  if (!rows.length) throw new Error('Request not found.');
  const s=rows[0];
  s.student_name=s.student_name||'Student'; s.roll_number=s.roll_number||'Not recorded'; s.registration_number=s.registration_number||'Not recorded'; s.department_name=s.department_name||'Not recorded';
  if (!['APPROVED','DOCUMENT_GENERATED','CERTIFICATE_GENERATED','COMPLETED'].includes(s.request_status)) throw new Error(`Certificate generation requires an approved request. Current status: ${s.request_status}`);
  const code=String(s.document_code||s.document_name||'').toUpperCase().replace(/[^A-Z0-9_]/g,'_');
  const template=TEMPLATES.find(t=>t.match.test(code));
  if (!template) throw new Error(`No certificate template configured for '${s.document_name || code}'.`);
  const [existing]=await connection.query('SELECT id,certificate_number,file_path,certificate_type,issue_date FROM certificates WHERE request_id=? LIMIT 1',[requestId]);
  // Rebuild a missing PDF using the existing certificate number; never create a duplicate record.
  const certificateNumber=existing.length ? existing[0].certificate_number : `${template.prefix}/${new Date().getFullYear()}/${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const base=(process.env.API_PUBLIC_URL||'http://localhost:5000').replace(/\/$/,'');
  const verifyUrl=`${base}/api/student/certificates/verify/${encodeURIComponent(certificateNumber)}`;
  const qr=await QRCode.toBuffer(verifyUrl,{type:'png',width:140,margin:1});
  const dir=path.join(__dirname,'..','..','uploads','certificates');fs.mkdirSync(dir,{recursive:true});
  filePath=path.join(dir,`${safeName(certificateNumber)}.pdf`);
  const relativePath=path.relative(path.join(__dirname,'..','..'),filePath).replace(/\\/g,'/');
  await new Promise((resolve,reject)=>{const doc=new PDFDocument({size:'A4',margin:62});const stream=fs.createWriteStream(filePath);stream.on('finish',resolve);stream.on('error',reject);doc.on('error',reject);doc.pipe(stream);
   doc.lineWidth(2).rect(35,35,525,772).stroke('#1f3a5f');doc.lineWidth(.7).rect(43,43,509,756).stroke('#a88b43');
   const assetRoot=path.join(__dirname,'..','..','assets','certificates');
   const emblem=path.join(assetRoot,'college-emblem.png');
   const signature=path.join(assetRoot,'authorised-signature.png');
   if(fs.existsSync(emblem)) doc.image(emblem,62,55,{fit:[62,62]});
   doc.font('Helvetica-Bold').fontSize(16).fillColor('#17365d').text(process.env.COLLEGE_NAME || 'Government College of Engineering, Keonjhar',132,65,{width:365,align:'center'});
   doc.font('Helvetica').fontSize(9).fillColor('#333').text(process.env.COLLEGE_AFFILIATION || 'Biju Patnaik University of Technology',132,91,{width:365,align:'center'});
   if(s.profile_photo_path){const photoPath=path.resolve(__dirname,'..','..',s.profile_photo_path);if(fs.existsSync(photoPath))doc.image(photoPath,477,52,{fit:[66,82],align:'center',valign:'center'});}
   doc.moveTo(110,145).lineTo(485,145).lineWidth(1).stroke('#a88b43');
   doc.font('Helvetica-Bold').fontSize(19).fillColor('#17365d').text(template.title,62,166,{width:471,align:'center'});doc.font('Helvetica').fontSize(10).fillColor('#333').text(`Certificate No: ${certificateNumber}`,62,210,{width:471,align:'right'});doc.fontSize(12).text(`Request No: ${s.request_number}`,62,232);
   doc.fontSize(13).fillColor('#222').text(template.body(s),74,280,{width:447,align:'justify',lineGap:8});doc.font('Helvetica-Bold').fontSize(11).text('Student particulars',62,405);doc.font('Helvetica').fontSize(11).text(`Name: ${s.student_name||'—'}`,62,429).text(`Roll Number: ${s.roll_number||'—'}`,62,450).text(`Registration Number: ${s.registration_number||'—'}`,62,471).text(`Department: ${s.department_name||'—'}`,62,492).text(`Date of issue: ${new Date().toLocaleDateString('en-IN')}`,62,513);
   if(fs.existsSync(signature))doc.image(signature,83,620,{fit:[130,58]});doc.moveTo(62,681).lineTo(222,681).stroke('#444');doc.fontSize(10).fillColor('#222').text('Authorised Signatory',62,688,{width:160,align:'center'});doc.image(qr,410,615,{width:86,height:86});doc.fontSize(8).fillColor('#555').text('Scan to verify certificate record',385,704,{width:136,align:'center'});doc.fontSize(8).fillColor('#666').text('System-generated document. Valid only after approval and official institutional authentication.',62,745,{width:471,align:'center'});doc.end();});
  if(existing.length){
   await connection.query('UPDATE certificates SET file_path=?,qr_code_data=?,student_name=?,roll_number=?,registration_number=?,department_name=? WHERE id=?',[relativePath,verifyUrl,s.student_name||'Not recorded',s.roll_number||'Not recorded',s.registration_number||'Not recorded',s.department_name||'Not recorded',existing[0].id]);
  } else {
   await connection.query(`INSERT INTO certificates(request_id,certificate_number,certificate_type,student_name,roll_number,registration_number,department_name,issue_date,file_path,qr_code_data,generated_by) VALUES(?,?,?,?,?,?,?,CURDATE(),?,?,?)`,[requestId,certificateNumber,code,s.student_name||'Not recorded',s.roll_number||'Not recorded',s.registration_number||'Not recorded',s.department_name||'Not recorded',relativePath,verifyUrl,generatedBy]);
   const [insertedCertificate]=await connection.query('SELECT id FROM certificates WHERE request_id=? LIMIT 1',[requestId]);
   if(insertedCertificate.length) await connection.query('INSERT INTO certificate_verifications(certificate_id) VALUES(?)',[insertedCertificate[0].id]);
  }
  await connection.query(`UPDATE requests SET status='CERTIFICATE_GENERATED',completed_at=COALESCE(completed_at,NOW()) WHERE id=?`,[requestId]);
  await connection.query(`UPDATE request_deliveries SET delivery_status=CASE WHEN delivery_type='POSTAL' AND payment_status='PAID' THEN 'READY_FOR_DISPATCH' WHEN delivery_type='POSTAL' THEN 'PENDING_PAYMENT' ELSE 'NOT_REQUIRED' END WHERE request_id=?`,[requestId]);
  const [cert]=await connection.query('SELECT id,certificate_number,certificate_type,file_path,issue_date FROM certificates WHERE request_id=?',[requestId]);await connection.commit();return {alreadyExists:existing.length>0,restoredMissingFile:existing.length>0,certificate:cert[0]};
 } catch(e){await connection.rollback();if(filePath&&fs.existsSync(filePath)){try{fs.unlinkSync(filePath)}catch(_){}}throw e;} finally{connection.release();}
}
module.exports={generateGeneralCertificate};
