const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { generateGeneralCertificate } = require('../services/generalCertificateService');
const { generateNoDueCertificate } = require('../services/certificateService');

async function generateCertificate(req,res){
 try {
  const requestId=Number(req.params.requestId);
  if(!Number.isSafeInteger(requestId)||requestId<=0)return res.status(400).json({success:false,message:'Invalid request ID'});
  const [typeRows]=await pool.query(`SELECT dt.code FROM requests r JOIN document_types dt ON dt.id=r.document_type_id WHERE r.id=? LIMIT 1`,[requestId]);
  if(!typeRows.length)return res.status(404).json({success:false,message:'Request not found'});
  const code=String(typeRows[0].code||'').toUpperCase();
  const result=code.includes('NO_DUE') ? await generateNoDueCertificate({requestId,generatedBy:req.user?.userId||null}) : await generateGeneralCertificate({requestId,generatedBy:req.user?.userId||null});
  return res.status(200).json({success:true,message:result.alreadyExists?'Certificate already exists':'Certificate generated',...result});
 } catch(e){console.error('Certificate generation failed for request',req.params.requestId,e);return res.status(500).json({success:false,message:e.message||'Certificate generation failed'});}
}
async function downloadCertificate(req,res){
 try {
  const requestId=Number(req.params.requestId);const userId=Number(req.user?.userId);
  let [rows]=await pool.query(`SELECT c.file_path,c.certificate_number,UPPER(dt.code) document_code FROM certificates c JOIN requests r ON r.id=c.request_id JOIN students s ON s.id=r.student_id JOIN document_types dt ON dt.id=r.document_type_id WHERE r.id=? AND s.user_id=? LIMIT 1`,[requestId,userId]);
  if(!rows.length)return res.status(404).json({success:false,message:'Certificate not found for this student'});
  let absolute=path.resolve(__dirname,'..','..',rows[0].file_path);
  if(!fs.existsSync(absolute)){
   // Recover an existing certificate PDF from its database record, retaining its certificate number.
   if(String(rows[0].document_code||'').includes('NO_DUE')) await generateNoDueCertificate({requestId,generatedBy:userId});
   else await generateGeneralCertificate({requestId,generatedBy:userId});
   [rows]=await pool.query(`SELECT c.file_path,c.certificate_number FROM certificates c JOIN requests r ON r.id=c.request_id JOIN students s ON s.id=r.student_id WHERE r.id=? AND s.user_id=? LIMIT 1`,[requestId,userId]);
   if(!rows.length)return res.status(404).json({success:false,message:'Certificate record could not be recovered'});
   absolute=path.resolve(__dirname,'..','..',rows[0].file_path);
  }
  if(!fs.existsSync(absolute))return res.status(404).json({success:false,message:'Certificate PDF could not be restored. Please contact the portal administrator.'});
  return res.download(absolute,`${rows[0].certificate_number.replace(/[^a-zA-Z0-9_-]/g,'-')}.pdf`);
 } catch(e){console.error('Certificate download failed',e);return res.status(500).json({success:false,message:'Unable to download certificate'});}
}
async function verifyCertificate(req,res){
 try {
  const number=decodeURIComponent(req.params.certificateNumber||'');
  const [rows]=await pool.query(`SELECT certificate_number,certificate_type,issue_date,created_at FROM certificates WHERE certificate_number=? LIMIT 1`,[number]);
  if(!rows.length)return res.status(404).json({success:true,valid:false,message:'No matching certificate record was found'});
  return res.json({success:true,valid:true,certificate:{certificateNumber:rows[0].certificate_number,certificateType:rows[0].certificate_type,issueDate:rows[0].issue_date},message:'A matching certificate record exists. Confirm the signed original with the issuing institution.'});
 }catch(e){return res.status(500).json({success:false,message:'Verification is temporarily unavailable'});}
}
module.exports={generateCertificate,downloadCertificate,verifyCertificate};
