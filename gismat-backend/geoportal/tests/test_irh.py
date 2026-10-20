from django.test import SimpleTestCase

from geoportal.services.irh import calcular_irh, clasificar


class IRHTests(SimpleTestCase):
    def test_rango_y_clasificacion(self):
        maximo = calcular_irh(0, 5000, 1, "alta", "activo")
        minimo = calcular_irh(None, 0, 0, "baja", "inactivo")
        self.assertLessEqual(maximo.valor, 100)
        self.assertGreaterEqual(minimo.valor, 0)
        self.assertEqual(maximo.nivel, "Crítico")
        self.assertEqual(minimo.nivel, "Bajo")

    def test_umbrales(self):
        self.assertEqual(clasificar(39.9), "Bajo")
        self.assertEqual(clasificar(40), "Moderado")
        self.assertEqual(clasificar(69.9), "Moderado")
        self.assertEqual(clasificar(70), "Crítico")

    def test_monotonia(self):
        base = dict(volumen_m3=200, factor_residuo=0.5, permeabilidad="media", estado="activo")
        self.assertGreater(calcular_irh(10, **base).valor, calcular_irh(200, **base).valor)  # más cerca = más riesgo
        self.assertGreater(calcular_irh(50, **{**base, "volumen_m3": 500}).valor, calcular_irh(50, **base).valor)
        self.assertGreater(calcular_irh(50, **{**base, "permeabilidad": "alta"}).valor, calcular_irh(50, **base).valor)
        self.assertLess(calcular_irh(50, **{**base, "estado": "limpiado"}).valor, calcular_irh(50, **base).valor)

    def test_variables_registradas(self):
        r = calcular_irh(30, 100, 0.5, "media", "activo")
        self.assertEqual(set(r.variables["componentes"]), {"proximidad", "volumen", "composicion", "permeabilidad", "estado"})
        self.assertAlmostEqual(sum(r.variables["pesos"].values()), 1.0)

    def test_entradas_invalidas(self):
        for args in ((10, -1, 0.5, "media", "activo"), (10, 10, 0.5, "x", "activo"), (10, 10, 0.5, "media", "x")):
            with self.assertRaises(ValueError):
                calcular_irh(*args)


class IRHProvisorioTests(SimpleTestCase):
    def test_variables_pendientes_no_se_inventan(self):
        completo = calcular_irh(50, 200, 0.5, "media", "activo")
        parcial = calcular_irh(50, None, None, None, "activo")
        self.assertFalse(completo.provisorio)
        self.assertTrue(parcial.provisorio)
        self.assertEqual(sorted(parcial.variables["pendientes"]), ["composicion", "permeabilidad", "volumen"])
        self.assertEqual(set(parcial.variables["componentes"]), {"proximidad", "estado"})
        # solo proximidad y estado, con pesos renormalizados: (0,35·0,833 + 0,15·1) / 0,5
        self.assertAlmostEqual(parcial.valor, 88.3, places=1)

    def test_parcial_sigue_en_rango(self):
        self.assertEqual(calcular_irh(None, None, None, None, "inactivo").valor, 0.0)
        self.assertLessEqual(calcular_irh(0, None, None, None, "activo").valor, 100)
