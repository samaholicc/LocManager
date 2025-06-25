import React, { useEffect, useState, useCallback } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { ThemeProvider } from "./context/ThemeContext";
import Header from "./components/Header";
import Dashboard from "./components/Dashboard";
import Aside from "./components/Aside";
import Auth from "./components/Auth";
import OwnerDetails from "./components/OwnerDetails";
import TenantDetails from "./components/TenantDetails";
import CreatingOwner from "./components/CreatingOwner";
import CreatingParkingSlot from "./components/CreatingParkingSlot";
import ComplaintsViewer from "./components/ComplaintsViewer";
import RaisingComplaints from "./components/RaisingComplaints";
import ParkingSlot from "./components/ParkingSlot";
import PayMaintenance from "./components/PayMaintenance";
import CreatingTenant from "./components/CreatingTenant";
import RoomDetails from "./components/RoomDetails";
import ErrorPage from "./ErrorPage";
import ComplaintsViewerOwner from "./components/ComplaintsViewerOwner";
import RoomDetailsOwner from "./components/RoomDetailsOwner";
import MaintenanceRequests from "./components/MaintenanceRequests";
import EditOwnProfile from "./components/EditOwnProfile";
import EditUserProfile from "./components/EditUserProfile";
import Verified from "./components/Verified";
import UserManual from "./components/UserManual";
import Support from "./components/Support";
import ManagementPortal from "./components/ManagementPortal";
import { toast } from "react-toastify";

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // State for tenant data
  const [tenantRows, setTenantRows] = useState([]);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState(null);

  const forAdmin = [
    { label: "Accueil", path: "home" },
    { label: "Détails des locataires", path: "tenantdetails" },
    { label: "Détails des propriétaires", path: "ownerdetails" },
    { label: "Créer un propriétaire", path: "createowner" },
    { label: "Attribution d'une place de parking", path: "allottingparkingslot" },
    { label: "Plaintes", path: "complaints" },
    { label: "Demandes de maintenance", path: "maintenancerequests" },
    { label: "Modifier le profil", path: "/profile/edit" },
  ];
  const forEmployee = [
    { label: "Accueil", path: "home" },
    { label: "Plaintes", path: "complaints" },
    { label: "Demandes de maintenance", path: "maintenancerequests" },
    { label: "Modifier le profil", path: "/profile/edit" },
  ];
  const forTenant = [
    { label: "Accueil", path: "home" },
    { label: "Déposer une plainte", path: "raisingcomplaints" },
    { label: "Place de parking attribuée", path: "allotedparkingslot" },
    { label: "Payer l'entretien", path: "paymaintenance" },
    { label: "Modifier le profil", path: "/profile/edit" },
  ];
  const forOwner = [
    { label: "Accueil", path: "home" },
    { label: "Détails des locataires", path: "tenantdetails" },
    { label: "Plainte", path: "complaint" },
    { label: "Créer un locataire", path: "createtenant" },
    { label: "Détails des chambres", path: "roomdetails" },
    { label: "Demandes de maintenance", path: "maintenancerequests" },
    { label: "Modifier le profil", path: "/profile/edit" },
  ];

  const getNavItems = () => {
    const userType = JSON.parse(window.localStorage.getItem("whom"))?.userType;
    switch (userType) {
      case "admin":
        return forAdmin;
      case "employee":
        return forEmployee;
      case "tenant":
        return forTenant;
      case "owner":
        return forOwner;
      default:
        return [];
    }
  };

  const navItems = getNavItems();
  const basePath = JSON.parse(window.localStorage.getItem("whom"))?.userType || "";

  // Fetch tenants for owner user type with retry logic
  const fetchTenants = useCallback(async (attempt = 1, maxAttempts = 3) => {
    setTenantLoading(true);
    setTenantError(null);
    try {
      const userId = JSON.parse(window.localStorage.getItem("whom"))?.username;
      if (!userId || typeof userId !== "string") {
        throw new Error("Invalid userId: userId must be a non-empty string.");
      }

      const apiUrl = `${process.env.REACT_APP_SERVER}/ownertenantdetails`;
      console.log(`Attempt ${attempt}/${maxAttempts} - API URL for tenants:`, apiUrl);
      console.log(`Attempt ${attempt}/${maxAttempts} - Request payload for tenants:`, { userId });

      const res = await axios.post(apiUrl, { userId }, {
        headers: {
          "Content-Type": "application/json",
        },
      });
      console.log(`Attempt ${attempt}/${maxAttempts} - Tenant data from server:`, res.data);

      const data = Array.isArray(res.data) ? res.data : [];
      if (data.length === 0) {
        console.warn(`Attempt ${attempt}/${maxAttempts} - No tenants found in response data.`);
        if (attempt < maxAttempts) {
          console.log(`Retrying fetch, attempt #${attempt + 1}`);
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before retrying
          return await fetchTenants(attempt + 1, maxAttempts);
        }
      }
      setTenantRows(data);
    } catch (error) {
      console.error("Error fetching tenants:", error);
      console.error("Error response:", error.response);
      const errorMessage =
        error.response?.data?.message || "Échec de la récupération des données des locataires";
      setTenantError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setTenantLoading(false);
    }
  }, []);

  useEffect(() => {
    const userType = JSON.parse(window.localStorage.getItem("whom"))?.userType;
    if (userType === "owner") {
      fetchTenants();
    }
  }, [fetchTenants]);

  // Redirect to the correct dashboard if the user is on the wrong route
  useEffect(() => {
    const userType = JSON.parse(window.localStorage.getItem("whom"))?.userType;
    const currentPath = location.pathname.split("/")[1]; // e.g., "admin" from "/admin"

    console.log("Current path:", currentPath, "User type:", userType);

    // List of shared routes that all user types can access
    const sharedRoutes = ["profile", "verified", "user-manual", "support", "management-portal"];

    // Redirect if the user is on a user-type-specific route that doesn't match their userType
    if (
      userType &&
      !sharedRoutes.includes(currentPath) &&
      currentPath !== userType &&
      currentPath !== ""
    ) {
      console.log(`Redirecting from /${currentPath} to /${userType}`);
      navigate(`/${userType}`, { replace: true });
    }
  }, [location, navigate]);

  return (
    <ThemeProvider>
      <div className="App font-mons background">
        <Routes>
          <Route path="/" element={<Auth />} />
          <Route
            path="/admin"
            element={
              <main>
                <Header forHam={[...forAdmin.map(item => item.label), "Déconnexion"]} />
                <section className="flex">
                  <Aside forHam={forAdmin} base={'admin'} />
                  <Dashboard navItems={forAdmin} basePath={'admin'} />
                </section>
              </main>
            }
          />
          <Route path="/user-manual" element={<UserManual />} />
          <Route
            path="/employee"
            element={
              <main>
                <Header forHam={[...forEmployee.map(item => item.label), "Déconnexion"]} />
                <section className="flex">
                  <Aside forHam={forEmployee} base={'employee'} />
                  <Dashboard navItems={forEmployee} basePath={'employee'} />
                </section>
              </main>
            }
          />
          <Route path="/management-portal" element={<ManagementPortal />} />
          <Route path="/support" element={<Support />} />
          <Route
            path="/tenant"
            element={
              <main>
                <Header forHam={[...forTenant.map(item => item.label), "Déconnexion"]} />
                <section className="flex">
                  <Aside forHam={forTenant} base={'tenant'} />
                  <Dashboard navItems={forTenant} basePath={'tenant'} />
                </section>
              </main>
            }
          />
          <Route
            path="/owner"
            element={
              <main>
                <Header forHam={[...forOwner.map(item => item.label), "Déconnexion"]} />
                <section className="flex">
                  <Aside forHam={forOwner} base={'owner'} />
                  <Dashboard navItems={forOwner} basePath={'owner'} tenantRows={tenantRows} tenantLoading={tenantLoading} tenantError={tenantError} />
                </section>
              </main>
            }
          />
          <Route
            path="/admin/ownerdetails"
            element={
              <main>
                <Header forHam={forAdmin.map(item => item.label)} />
                <section className="dashboardSkeleton">
                  <Aside forHam={forAdmin} base={'admin'} />
                  <OwnerDetails />
                </section>
              </main>
            }
          />
          <Route
            path="/admin/tenantdetails"
            element={
              <main>
                <Header forHam={forAdmin.map(item => item.label)} />
                <section className="dashboardSkeleton">
                  <Aside forHam={forAdmin} base={'admin'} />
                  <TenantDetails tenantRows={tenantRows} tenantLoading={tenantLoading} tenantError={tenantError} />
                </section>
              </main>
            }
          />
          <Route
            path="/admin/createowner"
            element={
              <main>
                <Header forHam={forAdmin.map(item => item.label)} />
                <section className="dashboardSkeleton">
                  <Aside forHam={forAdmin} base={'admin'} />
                  <CreatingOwner />
                </section>
              </main>
            }
          />
          <Route
            path="/admin/allottingparkingslot"
            element={
              <main>
                <Header forHam={forAdmin.map(item => item.label)} />
                <section className="dashboardSkeleton">
                  <Aside forHam={forAdmin} base={'admin'} />
                  <CreatingParkingSlot />
                </section>
              </main>
            }
          />
          <Route
            path="/admin/complaints"
            element={
              <main>
                <Header forHam={forAdmin.map(item => item.label)} />
                <section className="dashboardSkeleton">
                  <Aside forHam={forAdmin} base={'admin'} />
                  <ComplaintsViewerOwner />
                </section>
              </main>
            }
          />
          <Route
            path="/tenant/raisingcomplaints"
            element={
              <main>
                <Header forHam={forTenant.map(item => item.label)} />
                <section className="dashboardSkeleton">
                  <Aside forHam={forTenant} base={'tenant'} />
                  <RaisingComplaints />
                </section>
              </main>
            }
          />
          <Route
            path="/tenant/allotedparkingslot"
            element={
              <main>
                <Header forHam={forTenant.map(item => item.label)} />
                <section className="dashboardSkeleton">
                  <Aside forHam={forTenant} base={'tenant'} />
                  <ParkingSlot />
                </section>
              </main>
            }
          />
          <Route
            path="/tenant/paymaintenance"
            element={
              <main>
                <Header forHam={forTenant.map(item => item.label)} />
                <section className="dashboardSkeleton">
                  <Aside forHam={forTenant} base={'tenant'} />
                  <PayMaintenance />
                </section>
              </main>
            }
          />
          <Route
            path="/profile/edit"
            element={
              <main>
                <Header forHam={[...navItems.map(item => item.label), "Déconnexion"]} />
                <section className="dashboardSkeleton">
                  <Aside forHam={navItems} base={basePath} />
                  <EditOwnProfile />
                </section>
              </main>
            }
          />
          <Route
            path="/:userType/edit-profile/:id"
            element={
              <main>
                <Header forHam={[...navItems.map(item => item.label), "Déconnexion"]} />
                <section className="dashboardSkeleton">
                  <Aside forHam={navItems} base={basePath} />
                  <EditUserProfile />
                </section>
              </main>
            }
          />
          <Route
            path="/owner/tenantdetails"
            element={
              <main>
                <Header forHam={forOwner.map(item => item.label)} />
                <section className="dashboardSkeleton">
                  <Aside forHam={forOwner} base={'owner'} />
                  <TenantDetails tenantRows={tenantRows} tenantLoading={tenantLoading} tenantError={tenantError} />
                </section>
              </main>
            }
          />
          <Route
            path="/owner/complaint"
            element={
              <main>
                <Header forHam={forOwner.map(item => item.label)} />
                <section className="dashboardSkeleton">
                  <Aside forHam={forOwner} base={'owner'} />
                  <ComplaintsViewerOwner />
                </section>
              </main>
            }
          />
          <Route
            path="/owner/createtenant"
            element={
              <main>
                <Header forHam={forOwner.map(item => item.label)} />
                <section className="dashboardSkeleton">
                  <Aside forHam={forOwner} base={'owner'} />
                  <CreatingTenant />
                </section>
              </main>
            }
          />
          <Route
            path="/owner/roomdetails"
            element={
              <main>
                <Header forHam={forOwner.map(item => item.label)} />
                <section className="dashboardSkeleton">
                  <Aside forHam={forOwner} base={'owner'} />
                  <RoomDetailsOwner />
                </section>
              </main>
            }
          />
          <Route
            path="/employee/complaint"
            element={
              <main>
                <Header forHam={forEmployee.map(item => item.label)} />
                <section className="dashboardSkeleton">
                  <Aside forHam={forEmployee} base={'employee'} />
                  <ComplaintsViewer />
                </section>
              </main>
            }
          />
          <Route
            path="/owner/maintenancerequests"
            element={
              <main>
                <Header forHam={forOwner.map(item => item.label)} />
                <section className="dashboardSkeleton">
                  <Aside forHam={forOwner} base={'owner'} />
                  <MaintenanceRequests />
                </section>
              </main>
            }
          />
          <Route path="/verified" element={<Verified />} />
          <Route
            path="/admin/maintenancerequests"
            element={
              <main>
                <Header forHam={forAdmin.map(item => item.label)} />
                <section className="dashboardSkeleton">
                  <Aside forHam={forAdmin} base={'admin'} />
                  <MaintenanceRequests />
                </section>
              </main>
            }
          />
          <Route
            path="/employee/maintenancerequests"
            element={
              <main>
                <Header forHam={forEmployee.map(item => item.label)} />
                <section className="dashboardSkeleton">
                  <Aside forHam={forEmployee} base={'employee'} />
                  <MaintenanceRequests />
                </section>
              </main>
            }
          />
          <Route path="/*" element={<main><ErrorPage /></main>} />
        </Routes>
      </div>
    </ThemeProvider>
  );
}

export default App;