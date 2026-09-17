async function test() {
  const loginRes = await fetch('http://localhost:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'PROF001', password: 'prof123' }),
  });
  const cookie = loginRes.headers.get('set-cookie');

  // Test Ingestion
  const ingestRes = await fetch('http://localhost:3000/api/v1/library/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: cookie || '' },
    body: JSON.stringify({
      title: 'Engenharia de Software Moderna',
      author: 'Marco Tulio Valente',
      category: 'Engenharia de Software',
      text: 'Princípios de arquitetura de software, Clean Architecture, microsserviços e testes automatizados.',
    }),
  });
  const ingestData = await ingestRes.json();
  console.log('Ingest Result:', ingestData.success, ingestData.material?.materialId);

  // Test Listing
  const docsRes = await fetch('http://localhost:3000/api/v1/library/documents', {
    headers: { cookie: cookie || '' },
  });
  const docsData = await docsRes.json();
  console.log('Docs Count:', docsData.documents?.length, 'Categories Count:', docsData.categories?.length);

  // Test Generate with the newly ingested doc included
  const genRes = await fetch('http://localhost:3000/api/v1/teacher/plans/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: cookie || '' },
    body: JSON.stringify({
      subjectName: 'Engenharia de Software',
      courseName: 'Sistemas de Informação',
      academicPeriod: '2º Semestre / 2026',
      selectedReferences: docsData.documents || [],
    }),
  });
  const genData = await genRes.json();
  console.log('Generate Result:', genData.success);
  console.log('Generated Syllabus:', genData.data?.syllabus?.slice(0, 100));
}

test().catch(console.error);
