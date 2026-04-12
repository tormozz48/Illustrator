import { ReactNode } from 'react';
import { AppBar, Toolbar, Typography, Container, Button, Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="sticky" color="default" elevation={1}>
        <Toolbar>
          <AutoStoriesIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography
            variant="h6"
            component={RouterLink}
            to="/"
            sx={{ flexGrow: 1, textDecoration: 'none', color: 'inherit' }}
          >
            Illustrator
          </Typography>
          <Button component={RouterLink} to="/" color="inherit">
            Upload
          </Button>
          <Button component={RouterLink} to="/books" color="inherit">
            Books
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, flex: 1 }}>
        {children}
      </Container>
    </Box>
  );
}
