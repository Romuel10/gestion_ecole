import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { calculateCashClosure } from '../src/services/cashClosure.ts';
import { createHarness,schoolFixture } from './support/serviceLoader.cjs';

test('clôture physique : espèces seules, avec solde initial et dépenses', () => {
  const rows=[
    {date:'2026-10-03',type:'RECETTE',amount:10000,paymentMethod:'ESPECES'},
    {date:'2026-10-03',type:'RECETTE',amount:70000,paymentMethod:'VIREMENT'},
    {date:'2026-10-04',type:'RECETTE',amount:50000,paymentMethod:'ESPECES'},
    {date:'2026-10-04',type:'RECETTE',amount:100000,paymentMethod:'VIREMENT'},
    {date:'2026-10-04',type:'DEPENSE',amount:5000,paymentMethod:'ESPECES'},
    {date:'2026-10-04',type:'RECETTE',amount:8000,paymentMethod:'MOBILE_MONEY'},
  ].map((row,i)=>({...row,id:String(i),schoolYearId:'year'}));
  const result=calculateCashClosure(rows as any,'year','2026-10-04',55000);
  assert.equal(result.expectedClosingBalance,55000);assert.equal(result.closingDifference,0);assert.equal(result.cashOnClosingDate.length,2);
});

test('emploi du temps : volumes 0, 0,5, 1, 2, 3 et 5 heures exactement', () => {
  const {TimetableGeneratorService}=createHarness().load('src/services/timetableGenerator.ts');
  const minutes=(time:string)=>{const [h,m]=time.split(':').map(Number);return h*60+m;};
  for (const hours of [0,0.5,1,2,3,5]) {
    const db=schoolFixture();db.classes[0].subjects[0].weeklyHours=hours;
    const result=TimetableGeneratorService.generate(db);
    assert.equal(result.slots.reduce((sum:number,slot:any)=>sum+minutes(slot.endTime)-minutes(slot.startTime),0),hours*60);
    assert.equal(result.unassigned.length,0);
  }
});

test('import Excel : 31 février refusé, 29 février bissextile accepté', async () => {
  const {ExcelImportService}=createHarness().load('src/services/excelImporter.ts');
  for (const [date,accepted] of [['31-02-2015',false],['29-02-2016',true],['29-02-2015',false]] as const) {
    const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet([{Matricule:'TEST002',Nom:'FICTIF',Prénoms:'Deux',Sexe:'F','Date naissance':date,Classe:'C1'}]),'Eleves');
    const buffer=XLSX.write(workbook,{type:'buffer',bookType:'xlsx'});
    const result=await ExcelImportService.parseStudents({arrayBuffer:async()=>buffer},schoolFixture());
    assert.equal(result.students.length,accepted?1:0);assert.equal(result.issues.length>0,!accepted);
  }
});
