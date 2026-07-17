import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Landing from "@/pages/Landing";
import StudentDashboard from "@/pages/StudentDashboard";
import FacultyLogin from "@/pages/FacultyLogin";
import FacultyDashboard from "@/pages/FacultyDashboard";
import VerifyLink from "@/pages/VerifyLink";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/verify" element={<VerifyLink />} />
          <Route path="/student/dashboard" element={<StudentDashboard />} />
          <Route path="/faculty/login" element={<FacultyLogin />} />
          <Route path="/faculty/dashboard" element={<FacultyDashboard />} />
        </Routes>
      </BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            borderRadius: 0,
            border: "1px solid #e6e6e4",
            fontFamily: "IBM Plex Sans, sans-serif",
          },
        }}
      />
    </div>
  );
}

export default App;
