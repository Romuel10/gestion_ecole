import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { DatabaseSchema } from '../../types/school';
import { CalculationService } from '../../services/calculations';
import { Building2, Layers, Sparkles, TrendingUp, DollarSign } from 'lucide-react';

interface Campus3DVisualizerProps {
  db: DatabaseSchema;
  isDark: boolean;
}

export const Campus3DVisualizer: React.FC<Campus3DVisualizerProps> = ({ db, isDark }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hoveredObject, setHoveredObject] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'CAMPUS' | 'ACADEMIC' | 'TREASURY'>('CAMPUS');

  const metrics = CalculationService.computeFinancialMetrics(db);
  const totalStudents = db.students.length;
  const totalTeachers = db.teachers.length;
  const totalClasses = db.classes.length;

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 340;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDark ? 0x090d16 : 0xf8fafc);
    scene.fog = new THREE.FogExp2(isDark ? 0x090d16 : 0xf8fafc, 0.025);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(22, 18, 26);
    camera.lookAt(0, 2, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.replaceChildren(renderer.domElement);

    // 2. Lights
    const ambientLight = new THREE.AmbientLight(isDark ? 0x64748b : 0xe2e8f0, isDark ? 0.9 : 1.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, isDark ? 1.5 : 1.8);
    dirLight.position.set(15, 30, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const bluePointLight = new THREE.PointLight(0x3b82f6, isDark ? 2 : 1.2, 40);
    bluePointLight.position.set(-10, 8, -5);
    scene.add(bluePointLight);

    const emeraldPointLight = new THREE.PointLight(0x10b981, isDark ? 2 : 1.2, 40);
    emeraldPointLight.position.set(10, 8, 5);
    scene.add(emeraldPointLight);

    // 3. Ground Grid
    const gridHelper = new THREE.GridHelper(36, 36, isDark ? 0x334155 : 0xcbd5e1, isDark ? 0x1e293b : 0xe2e8f0);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // Interactive objects group
    const interactiveGroup = new THREE.Group();
    scene.add(interactiveGroup);

    const buildingMeshes: THREE.Mesh[] = [];

    if (viewMode === 'CAMPUS') {
      // Create Stylized Modern Isometric 3D School Buildings
      // A. Administration & Direction Building
      const adminGeo = new THREE.BoxGeometry(6, 4.5, 4.5);
      const adminMat = new THREE.MeshStandardMaterial({
        color: isDark ? 0x1e3a8a : 0x2563eb,
        roughness: 0.2,
        metalness: 0.3,
      });
      const adminMesh = new THREE.Mesh(adminGeo, adminMat);
      adminMesh.position.set(-6, 2.25, -4);
      adminMesh.castShadow = true;
      adminMesh.receiveShadow = true;
      adminMesh.name = "Bâtiment Administratif & Direction (Proviseur, Scolarité)";
      interactiveGroup.add(adminMesh);
      buildingMeshes.push(adminMesh);

      // Roof Accent
      const roofGeo = new THREE.BoxGeometry(6.4, 0.4, 4.9);
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1 });
      const roofMesh = new THREE.Mesh(roofGeo, roofMat);
      roofMesh.position.set(-6, 4.7, -4);
      interactiveGroup.add(roofMesh);

      // B. Main Classroom Pavilion (Lycée & Collège)
      const classGeo = new THREE.BoxGeometry(9, 6.5, 5);
      const classMat = new THREE.MeshStandardMaterial({
        color: isDark ? 0x0f766e : 0x059669,
        roughness: 0.25,
        metalness: 0.2,
      });
      const classMesh = new THREE.Mesh(classGeo, classMat);
      classMesh.position.set(5, 3.25, -3);
      classMesh.castShadow = true;
      classMesh.receiveShadow = true;
      classMesh.name = `Pavillon Pédagogique (${totalClasses} Classes, ${totalStudents} Élèves)`;
      interactiveGroup.add(classMesh);
      buildingMeshes.push(classMesh);

      // C. Science Laboratories & IT Bloc
      const sciGeo = new THREE.BoxGeometry(5.5, 5, 4);
      const sciMat = new THREE.MeshStandardMaterial({
        color: isDark ? 0x7c3aed : 0x6366f1,
        roughness: 0.3,
        metalness: 0.3,
      });
      const sciMesh = new THREE.Mesh(sciGeo, sciMat);
      sciMesh.position.set(-4, 2.5, 6);
      sciMesh.castShadow = true;
      sciMesh.receiveShadow = true;
      sciMesh.name = "Laboratoires Scientifiques (SVT / SPC & Salle Informatique)";
      interactiveGroup.add(sciMesh);
      buildingMeshes.push(sciMesh);

      // D. Sports & Culture Complex
      const gymGeo = new THREE.BoxGeometry(7, 3, 4.5);
      const gymMat = new THREE.MeshStandardMaterial({
        color: isDark ? 0xc2410c : 0xe11d48,
        roughness: 0.4,
        metalness: 0.1,
      });
      const gymMesh = new THREE.Mesh(gymGeo, gymMat);
      gymMesh.position.set(6, 1.5, 6);
      gymMesh.castShadow = true;
      gymMesh.receiveShadow = true;
      gymMesh.name = "Terrain de Sport EPS & Salle Polyvalente";
      interactiveGroup.add(gymMesh);
      buildingMeshes.push(gymMesh);

      // Cour centrale pavée
      const courtGeo = new THREE.BoxGeometry(6, 0.1, 5);
      const courtMat = new THREE.MeshStandardMaterial({ color: isDark ? 0x1e293b : 0xd1d5db, roughness: 0.8 });
      const courtMesh = new THREE.Mesh(courtGeo, courtMat);
      courtMesh.position.set(0, 0.05, 1);
      courtMesh.receiveShadow = true;
      interactiveGroup.add(courtMesh);

      // Mât du Drapeau National Malagasy
      const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 6);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.1 });
      const poleMesh = new THREE.Mesh(poleGeo, poleMat);
      poleMesh.position.set(0, 3, 1);
      interactiveGroup.add(poleMesh);
    } else if (viewMode === 'ACADEMIC') {
      // 3D Academic Performance Bars per Class
      db.classes.forEach((c, idx) => {
        const xPos = (idx - db.classes.length / 2) * 3.5 + 1.5;
        const height = Math.max(2, (c.subjects.length * 0.7) + 2);

        const colGeo = new THREE.CylinderGeometry(1.1, 1.1, height, 24);
        const colMat = new THREE.MeshStandardMaterial({
          color: idx % 3 === 0 ? 0x3b82f6 : idx % 3 === 1 ? 0x10b981 : 0x8b5cf6,
          metalness: 0.4,
          roughness: 0.2,
        });
        const colMesh = new THREE.Mesh(colGeo, colMat);
        colMesh.position.set(xPos, height / 2, 0);
        colMesh.castShadow = true;
        colMesh.receiveShadow = true;
        colMesh.name = `Classe: ${c.name} (${c.level.toUpperCase()} - Coeffs: ${c.subjects.reduce((a, b) => a + b.coefficient, 0)})`;
        interactiveGroup.add(colMesh);
        buildingMeshes.push(colMesh);

        // Ring base
        const ringGeo = new THREE.TorusGeometry(1.4, 0.1, 12, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8 });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI / 2;
        ringMesh.position.set(xPos, 0.1, 0);
        interactiveGroup.add(ringMesh);
      });
    } else {
      // 3D Treasury Flow Visualizer
      const revHeight = 7.5;
      const expHeight = 5.2;

      // Revenue Cylinder
      const revGeo = new THREE.BoxGeometry(4.5, revHeight, 4.5);
      const revMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.2, metalness: 0.5 });
      const revMesh = new THREE.Mesh(revGeo, revMat);
      revMesh.position.set(-4.5, revHeight / 2, 0);
      revMesh.castShadow = true;
      revMesh.name = `Recettes Totales: ${CalculationService.formatAriary(metrics.grandTotalRevenues)}`;
      interactiveGroup.add(revMesh);
      buildingMeshes.push(revMesh);

      // Expenses Cylinder
      const expGeo = new THREE.BoxGeometry(4.5, expHeight, 4.5);
      const expMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.2, metalness: 0.5 });
      const expMesh = new THREE.Mesh(expGeo, expMat);
      expMesh.position.set(4.5, expHeight / 2, 0);
      expMesh.castShadow = true;
      expMesh.name = `Dépenses & Salaires: ${CalculationService.formatAriary(metrics.grandTotalExpenses)}`;
      interactiveGroup.add(expMesh);
      buildingMeshes.push(expMesh);
    }

    // 4. Mouse Raycasting for interactive tooltips
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-999, -999);

    const onMouseMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(buildingMeshes);

      if (intersects.length > 0) {
        const obj = intersects[0].object as THREE.Mesh;
        setHoveredObject(obj.name || null);
        container.style.cursor = 'pointer';
      } else {
        setHoveredObject(null);
        container.style.cursor = 'default';
      }
    };

    const onClick = () => {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(buildingMeshes);
      if (intersects.length > 0) {
        setHoveredObject(intersects[0].object.name || null);
      }
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('click', onClick);

    // 5. Smooth Auto-rotation Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      const elapsedTime = clock.getElapsedTime();
      interactiveGroup.rotation.y = elapsedTime * 0.12;

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    // Resize Handler
    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth || 800;
      const h = mountRef.current.clientHeight || 340;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('click', onClick);
      renderer.dispose();
    };
  }, [viewMode, isDark, db]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 shadow-xl">
      {/* 3D Controls Header Overlay */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-auto">
        <div className="flex items-center space-x-2 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/60 shadow">
          <Building2 className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-semibold tracking-wide text-slate-200">
            Modélisation 3D Interactive — {db.schoolConfig.name}
          </span>
        </div>

        {/* View Switcher */}
        <div className="flex items-center space-x-1 bg-slate-900/80 backdrop-blur-md p-1 rounded-xl border border-slate-700/60 shadow">
          <button
            onClick={() => setViewMode('CAMPUS')}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition flex items-center space-x-1.5 ${
              viewMode === 'CAMPUS'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Campus 3D</span>
          </button>
          <button
            onClick={() => setViewMode('ACADEMIC')}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition flex items-center space-x-1.5 ${
              viewMode === 'ACADEMIC'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Classes & Pôles</span>
          </button>
          <button
            onClick={() => setViewMode('TREASURY')}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition flex items-center space-x-1.5 ${
              viewMode === 'TREASURY'
                ? 'bg-amber-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Trésorerie 3D</span>
          </button>
        </div>
      </div>

      {/* Canvas Mount */}
      <div ref={mountRef} className="w-full h-72 sm:h-80 cursor-grab active:cursor-grabbing" />

      {/* Hover / Selected Info Tooltip */}
      {hoveredObject && (
        <div className="absolute bottom-3 left-3 z-10 bg-slate-900/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-blue-500/40 shadow-lg text-xs text-white flex items-center space-x-2 animate-fade-in">
          <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
          <span className="font-medium">{hoveredObject}</span>
        </div>
      )}

      {/* Bottom KPI summary bar */}
      <div className="absolute bottom-3 right-3 z-10 hidden sm:flex items-center space-x-3 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/60 text-[11px] text-slate-300">
        <div>
          <span className="text-slate-400">Effectif: </span>
          <span className="font-bold text-white">{totalStudents}</span>
        </div>
        <div className="w-1 h-1 rounded-full bg-slate-600" />
        <div>
          <span className="text-slate-400">Enseignants: </span>
          <span className="font-bold text-white">{totalTeachers}</span>
        </div>
        <div className="w-1 h-1 rounded-full bg-slate-600" />
        <div>
          <span className="text-slate-400">Solde Caisse: </span>
          <span className="font-bold text-emerald-400">
            {CalculationService.formatAriary(metrics.netTreasuryBalance)}
          </span>
        </div>
      </div>
    </div>
  );
};
