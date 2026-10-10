import { useNavigate } from 'react-router-dom';


export const useAppNavigation = () => {
  const navigate = useNavigate();
  return {
    goHome: () => navigate("/"),
    goBack: () => navigate(-1),
    goTo: (path: string) => navigate(path),
  };
};
